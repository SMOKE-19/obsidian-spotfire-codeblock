import { Plugin } from "obsidian";
import { RangeSetBuilder } from "@codemirror/state";
import {
  Decoration,
  DecorationSet,
  EditorView,
  ViewPlugin as CodeMirrorViewPlugin,
  ViewUpdate
} from "@codemirror/view";

const SPOTFIRE_LANGUAGE = "spotfire";

type SpotfireTokenKind = "column" | "alias" | "keyword" | "function" | "string";

interface SpotfireToken {
  from: number;
  to: number;
  kind: SpotfireTokenKind;
}

interface SpotfireDiagnostic {
  from: number;
  to: number;
  message: string;
}

interface SpotfireAnalysis {
  tokens: SpotfireToken[];
  diagnostics: SpotfireDiagnostic[];
}

interface AliasExpectation {
  from: number;
  to: number;
}

interface ReadResult {
  to: number;
  closed: boolean;
}

const KEYWORDS = new Set([
  "and",
  "as",
  "case",
  "else",
  "end",
  "false",
  "is",
  "not",
  "null",
  "or",
  "over",
  "then",
  "true",
  "when"
]);

const FUNCTIONS = new Set([
  "abs",
  "acos",
  "asin",
  "atan",
  "atan2",
  "autobinnumeric",
  "avg",
  "base64decode",
  "base64encode",
  "binbyevendistance",
  "binbyevendistribution",
  "binbyevenintervals",
  "binbyspecificlimits",
  "boolean",
  "cast",
  "ceiling",
  "chidist",
  "chiinv",
  "concatenate",
  "cos",
  "count",
  "countbig",
  "covariance",
  "currency",
  "date",
  "dateadd",
  "datediff",
  "datepart",
  "datetime",
  "datetimenow",
  "day",
  "dayofmonth",
  "dayofweek",
  "dayofyear",
  "days",
  "denserank",
  "exp",
  "fdist",
  "find",
  "finv",
  "first",
  "firstvalidafter",
  "fiscalmonth",
  "fiscalquarter",
  "fiscalyear",
  "floor",
  "fromepochmilliseconds",
  "fromepochseconds",
  "geometricmean",
  "greatcircledistance",
  "hour",
  "hours",
  "if",
  "integer",
  "iqr",
  "isoweek",
  "isoyear",
  "l95",
  "lag",
  "last",
  "lastvalidbefore",
  "lastvalueformax",
  "lastvalueformin",
  "lav",
  "lead",
  "left",
  "len",
  "lif",
  "ln",
  "lof",
  "log",
  "log10",
  "longinteger",
  "lower",
  "max",
  "meandeviation",
  "median",
  "medianabsolutedeviation",
  "mid",
  "millisecond",
  "milliseconds",
  "min",
  "minute",
  "minutes",
  "mod",
  "month",
  "mostcommon",
  "namedecode",
  "nameencode",
  "normdist",
  "norminv",
  "nthlargest",
  "nthsmallest",
  "outliers",
  "p10",
  "p90",
  "parsedate",
  "parsedatetime",
  "parsereal",
  "parsetime",
  "parsetimespan",
  "pctoutliers",
  "percent",
  "percentile",
  "pi",
  "power",
  "product",
  "q1",
  "q3",
  "quarter",
  "rand",
  "randbetween",
  "range",
  "rank",
  "rankreal",
  "real",
  "right",
  "round",
  "rxextract",
  "rxreplace",
  "second",
  "seconds",
  "sin",
  "singlereal",
  "sn",
  "split",
  "sqrt",
  "stddev",
  "stderr",
  "string",
  "substitute",
  "substring",
  "sum",
  "tan",
  "tdist",
  "time",
  "timespan",
  "tinv",
  "today",
  "toepochmilliseconds",
  "toepochseconds",
  "totaldays",
  "totalhours",
  "totalmilliseconds",
  "totalminutes",
  "totalseconds",
  "trim",
  "trimmedmean",
  "u95",
  "uav",
  "uif",
  "uniqueconcatenate",
  "uniquecount",
  "uof",
  "upper",
  "valueformax",
  "valueformin",
  "var",
  "week",
  "weightedaverage",
  "wkbenvelopexcenter",
  "wkbenvelopexmax",
  "wkbenvelopexmin",
  "wkbenvelopeycenter",
  "wkbenvelopeymax",
  "wkbenvelopeymin",
  "year",
  "yearandweek"
]);

const TOKEN_CLASS: Record<SpotfireTokenKind, string> = {
  column: "spotfire-token-column",
  alias: "spotfire-token-alias",
  keyword: "spotfire-token-keyword",
  function: "spotfire-token-function",
  string: "spotfire-token-string"
};

const tokenDecoration: Record<SpotfireTokenKind, Decoration> = {
  column: Decoration.mark({ class: TOKEN_CLASS.column }),
  alias: Decoration.mark({ class: TOKEN_CLASS.alias }),
  keyword: Decoration.mark({ class: TOKEN_CLASS.keyword }),
  function: Decoration.mark({ class: TOKEN_CLASS.function }),
  string: Decoration.mark({ class: TOKEN_CLASS.string })
};

const diagnosticDecoration = Decoration.mark({
  attributes: { title: "Spotfire expression issue" },
  class: "spotfire-token-error"
});

export default class SpotfireCodeblockPlugin extends Plugin {
  async onload() {
    this.registerMarkdownCodeBlockProcessor(SPOTFIRE_LANGUAGE, (source, el) => {
      renderSpotfireCodeBlock(source, el);
    });

    this.registerEditorExtension(spotfireEditorHighlighting);
  }
}

const spotfireEditorHighlighting = CodeMirrorViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = buildEditorDecorations(view);
    }

    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = buildEditorDecorations(update.view);
      }
    }
  },
  {
    decorations: (plugin) => plugin.decorations
  }
);

function buildEditorDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const ranges: Array<{ from: number; to: number; decoration: Decoration }> = [];
  let blockStart = 0;
  let blockSource = "";
  let insideSpotfireBlock = false;
  let activeFence = "";

  for (let lineNumber = 1; lineNumber <= view.state.doc.lines; lineNumber += 1) {
    const line = view.state.doc.line(lineNumber);
    const text = line.text;
    const startFence = matchSpotfireFence(text);

    if (!insideSpotfireBlock && startFence) {
      insideSpotfireBlock = true;
      activeFence = startFence;
      blockStart = line.to + 1;
      blockSource = "";
      continue;
    }

    if (insideSpotfireBlock && isClosingFence(text, activeFence)) {
      addAnalysisRanges(ranges, analyzeSpotfire(blockSource), blockStart);
      insideSpotfireBlock = false;
      activeFence = "";
      blockSource = "";
      continue;
    }

    if (insideSpotfireBlock) {
      if (blockSource.length > 0) {
        blockSource += "\n";
      }
      blockSource += text;
    }
  }

  if (insideSpotfireBlock) {
    addAnalysisRanges(ranges, analyzeSpotfire(blockSource), blockStart);
  }

  ranges
    .filter((range) => range.to > range.from)
    .sort((a, b) => a.from - b.from || a.to - b.to)
    .forEach((range) => builder.add(range.from, range.to, range.decoration));

  return builder.finish();
}

function addAnalysisRanges(
  ranges: Array<{ from: number; to: number; decoration: Decoration }>,
  analysis: SpotfireAnalysis,
  offset: number
): void {
  for (const token of analysis.tokens) {
    ranges.push({
      from: offset + token.from,
      to: offset + token.to,
      decoration: tokenDecoration[token.kind]
    });
  }

  for (const diagnostic of analysis.diagnostics) {
    ranges.push({
      from: offset + diagnostic.from,
      to: offset + diagnostic.to,
      decoration: diagnosticDecoration
    });
  }
}

function renderSpotfireCodeBlock(source: string, el: HTMLElement): void {
  el.empty();
  el.addClass("spotfire-codeblock");

  const pre = document.createElement("pre");
  const code = document.createElement("code");
  const analysis = analyzeSpotfire(source);

  appendHighlightedSource(code, source, analysis);

  pre.appendChild(code);
  el.appendChild(pre);
}

function appendHighlightedSource(parent: HTMLElement, source: string, analysis: SpotfireAnalysis): void {
  const boundaries = new Set([0, source.length]);

  for (const token of analysis.tokens) {
    boundaries.add(token.from);
    boundaries.add(token.to);
  }

  for (const diagnostic of analysis.diagnostics) {
    boundaries.add(diagnostic.from);
    boundaries.add(diagnostic.to);
  }

  const sorted = Array.from(boundaries).sort((a, b) => a - b);

  for (let index = 0; index < sorted.length - 1; index += 1) {
    const from = sorted[index];
    const to = sorted[index + 1];
    const text = source.slice(from, to);
    const token = analysis.tokens.find((candidate) => candidate.from <= from && candidate.to >= to);
    const diagnostics = analysis.diagnostics.filter((candidate) => candidate.from <= from && candidate.to >= to);

    if (!token && diagnostics.length === 0) {
      parent.appendChild(document.createTextNode(text));
      continue;
    }

    const span = document.createElement("span");
    span.className = [
      token ? TOKEN_CLASS[token.kind] : "",
      diagnostics.length > 0 ? "spotfire-token-error" : ""
    ].filter(Boolean).join(" ");
    span.textContent = text;

    if (diagnostics.length > 0) {
      span.title = diagnostics.map((diagnostic) => diagnostic.message).join("\n");
    }

    parent.appendChild(span);
  }
}

function analyzeSpotfire(text: string): SpotfireAnalysis {
  const tokens: SpotfireToken[] = [];
  const diagnostics: SpotfireDiagnostic[] = [];
  const openParens: number[] = [];
  let index = 0;
  let expectAliasColumn: AliasExpectation | null = null;

  while (index < text.length) {
    const char = text[index];

    if (char === "'") {
      const result = readString(text, index);
      tokens.push({ from: index, to: result.to, kind: "string" });
      if (!result.closed) {
        diagnostics.push({
          from: index,
          to: result.to,
          message: "Unclosed string literal."
        });
      }
      index = result.to;
      continue;
    }

    if (char === "[") {
      const result = expectAliasColumn ? readAliasColumn(text, index) : readColumn(text, index);
      tokens.push({ from: index, to: result.to, kind: expectAliasColumn ? "alias" : "column" });
      if (!result.closed) {
        diagnostics.push({
          from: index,
          to: result.to,
          message: expectAliasColumn ? "Unclosed alias column reference." : "Unclosed column reference."
        });
      }
      expectAliasColumn = null;
      index = result.to;
      continue;
    }

    if (isIdentifierStart(char)) {
      const from = index;
      index += 1;

      while (index < text.length && isIdentifierPart(text[index])) {
        index += 1;
      }

      const word = text.slice(from, index);
      const lowerWord = word.toLowerCase();

      if (KEYWORDS.has(lowerWord)) {
        tokens.push({ from, to: index, kind: "keyword" });
        expectAliasColumn = lowerWord === "as" ? { from, to: index } : null;
      } else if (FUNCTIONS.has(lowerWord)) {
        tokens.push({ from, to: index, kind: "function" });
        expectAliasColumn = null;
      } else if (expectAliasColumn) {
        diagnostics.push({
          from: expectAliasColumn.from,
          to: index,
          message: "Alias after as must be a bracketed column reference."
        });
        expectAliasColumn = null;
      }

      continue;
    }

    if (char === "(") {
      openParens.push(index);
      index += 1;
      continue;
    }

    if (char === ")") {
      if (openParens.length === 0) {
        diagnostics.push({
          from: index,
          to: index + 1,
          message: "Closing parenthesis has no matching opening parenthesis."
        });
      } else {
        openParens.pop();
      }

      if (expectAliasColumn) {
        diagnostics.push({
          from: expectAliasColumn.from,
          to: index + 1,
          message: "Alias after as must be a bracketed column reference."
        });
        expectAliasColumn = null;
      }

      index += 1;
      continue;
    }

    if (expectAliasColumn && !isWhitespace(char) && char !== "(") {
      diagnostics.push({
        from: expectAliasColumn.from,
        to: index + 1,
        message: "Alias after as must be a bracketed column reference."
      });
      expectAliasColumn = null;
    }

    index += 1;
  }

  if (expectAliasColumn) {
    diagnostics.push({
      from: expectAliasColumn.from,
      to: expectAliasColumn.to,
      message: "Missing alias column after as."
    });
  }

  for (const from of openParens) {
    diagnostics.push({
      from,
      to: from + 1,
      message: "Opening parenthesis has no matching closing parenthesis."
    });
  }

  return { tokens, diagnostics };
}

function readString(text: string, from: number): ReadResult {
  let index = from + 1;

  while (index < text.length) {
    if (text[index] === "'") {
      if (text[index + 1] === "'") {
        index += 2;
        continue;
      }

      return { to: index + 1, closed: true };
    }

    index += 1;
  }

  return { to: text.length, closed: false };
}

function readColumn(text: string, from: number): ReadResult {
  let index = from + 1;
  let depth = 1;

  while (index < text.length) {
    const char = text[index];

    if (char === "[") {
      depth += 1;
    } else if (char === "]") {
      depth -= 1;

      if (depth === 0) {
        return { to: index + 1, closed: true };
      }
    } else if (depth === 1 && (char === "," || char === ")" || isWhitespace(char))) {
      return { to: index, closed: false };
    }

    index += 1;
  }

  return { to: text.length, closed: false };
}

function readAliasColumn(text: string, from: number): ReadResult {
  let index = from + 1;

  while (index < text.length) {
    const char = text[index];

    if (char === "," || char === ")" || isWhitespace(char)) {
      return { to: index, closed: text[index - 1] === "]" };
    }

    index += 1;
  }

  return { to: text.length, closed: text.endsWith("]") };
}

function matchSpotfireFence(text: string): string | null {
  const match = text.match(/^\s*(```+|~~~+)\s*spotfire\b/i);
  return match?.[1] ?? null;
}

function isClosingFence(text: string, activeFence: string): boolean {
  if (!activeFence) {
    return false;
  }

  const fenceChar = activeFence[0];
  const minLength = activeFence.length;
  const match = text.match(/^\s*(```+|~~~+)\s*$/);

  return !!match && match[1][0] === fenceChar && match[1].length >= minLength;
}

function isIdentifierStart(char: string): boolean {
  return /[A-Za-z_]/.test(char);
}

function isIdentifierPart(char: string): boolean {
  return /[A-Za-z0-9_]/.test(char);
}

function isWhitespace(char: string): boolean {
  return /\s/.test(char);
}
