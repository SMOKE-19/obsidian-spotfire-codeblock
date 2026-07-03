# Spotfire Codeblock

Obsidian에서 `spotfire` 코드블럭 안의 Spotfire 표현식을 색상으로 구분해 보여주는 플러그인입니다.

## 기능

- `spotfire` 코드블럭 렌더링 지원
- 편집기 안 코드펜스 하이라이트 지원
- 컬럼 참조를 녹색으로 표시
- 문자열 리터럴을 분홍색으로 표시
- `over`, `as`, `case`, `when`, `then` 같은 Spotfire 키워드를 파란색으로 표시
- `Avg`, `If`, `Sum`, `DateDiff`, `Intersect` 같은 Spotfire 함수를 보라색으로 표시
- `as` 뒤에 오는 결과 컬럼 alias를 남색으로 표시
- 닫히지 않은 컬럼/문자열, 괄호 불일치, `as` 뒤 alias 누락을 물결 밑줄로 표시

## 사용 예시

Markdown 문서에 다음처럼 작성합니다.

````markdown
```spotfire
Avg(if([column1]='text',10,14)) over ([column2]) as [column3[nm]]]
```
````

현재 색상 규칙은 다음과 같습니다.

- `[column1]`, `[column2]`: 컬럼 참조
- `'text'`: 문자열
- `Avg`, `if`: Spotfire 함수
- `over`, `as`: Spotfire 키워드
- `[column3[nm]]]`: `as` 뒤 alias 컬럼

`as` 뒤 alias는 줄바꿈을 허용합니다.

```spotfire
Avg([column1]) over ([column2]) as
[column3[nm]]]
```

`Intersect()`처럼 `OVER` 안에서 쓰는 Spotfire navigation method도 함수 색상으로 표시합니다.

```spotfire
Avg([Sales]) over Intersect([Cat], AllPrevious([Year]))
```

다음과 같은 표현은 lint 표시가 붙습니다.

```spotfire
Avg(if([column1]='text',10,14)) over ([column2) as
```

## 프로젝트 구조

- `main.ts`: Obsidian 플러그인 진입점, Spotfire 토큰 하이라이터, lightweight lint 분석
- `styles.css`: 읽기 모드와 편집 모드의 토큰 색상
- `manifest.json`: Obsidian 플러그인 메타데이터
- `esbuild.config.mjs`: `main.ts`를 `main.js`로 번들링하는 설정
- `versions.json`: Obsidian 플러그인 버전 호환 정보

## 빌드

의존성을 설치합니다.

```bash
npm install
```

배포용 파일을 빌드합니다.

```bash
npm run build
```

빌드가 끝나면 Obsidian 플러그인 배포에 필요한 파일은 다음입니다.

- `manifest.json`
- `main.js`
- `styles.css`

## 설치

GitHub Release asset에서 `spotfire-codeblock-{version}.zip` 파일을 내려받습니다. 압축을 풀면 다음 구조의 폴더가 들어 있습니다.

```text
spotfire-codeblock/
  manifest.json
  main.js
  styles.css
```

압축을 푼 `spotfire-codeblock/` 폴더를 Obsidian vault의 플러그인 폴더에 배치합니다.

```text
.obsidian/plugins/spotfire-codeblock/
  manifest.json
  main.js
  styles.css
```

그 다음 Obsidian에서 커뮤니티 플러그인 목록을 새로고침하고 `Spotfire Codeblock`을 활성화합니다.

Release에는 Obsidian 커뮤니티 플러그인 등록 호환을 위해 `manifest.json`, `main.js`, `styles.css` 개별 파일도 함께 올라갈 수 있습니다. 수동 설치할 때는 ZIP 파일을 받는 쪽이 편합니다.

## 구현 메모

이 플러그인은 Spotfire 전체 문법 파서가 아니라 코드블럭 하이라이트용 tokenizer를 사용합니다. lint 표시는 닫히지 않은 토큰, 괄호 불일치, alias 누락처럼 빠르게 확인 가능한 구조 오류에 초점을 둡니다.
