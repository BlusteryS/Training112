export type CodeTokenKind =
  | 'attribute'
  | 'comment'
  | 'function'
  | 'keyword'
  | 'number'
  | 'plain'
  | 'punctuation'
  | 'string'
  | 'tag';

export type CodeToken = {
  kind: CodeTokenKind;
  value: string;
};

const keywords = new Set([
  'async',
  'await',
  'const',
  'default',
  'export',
  'false',
  'from',
  'function',
  'import',
  'let',
  'new',
  'null',
  'return',
  'true',
  'undefined',
  'var',
]);
const multiCharacterPunctuation = [
  '===',
  '!==',
  '=>',
  '/>',
  '</',
  '==',
  '!=',
  '>=',
  '<=',
  '&&',
  '||',
  '??',
  '?.',
  '...',
];

function isIdentifierStart(character: string | undefined) {
  return character !== undefined && /[A-Za-z_$]/u.test(character);
}

function isIdentifierPart(character: string | undefined, inJsxTag: boolean) {
  if (character === undefined) {
    return false;
  }

  return inJsxTag ? /[\w$:-]/u.test(character) : /[\w$]/u.test(character);
}

function isDigit(character: string | undefined) {
  return character !== undefined && /\d/u.test(character);
}

function nextNonWhitespaceIndex(source: string, startIndex: number) {
  let index = startIndex;

  while (index < source.length && /\s/u.test(source[index] ?? '')) {
    index += 1;
  }

  return index;
}

function pushToken(tokens: CodeToken[], kind: CodeTokenKind, value: string) {
  if (!value) {
    return;
  }

  const previousToken = tokens.at(-1);

  if (previousToken?.kind === kind) {
    previousToken.value += value;
    return;
  }

  tokens.push({ kind, value });
}

function readQuotedValue(source: string, startIndex: number) {
  const quote = source[startIndex];
  let index = startIndex + 1;

  while (index < source.length) {
    if (source[index] === '\\') {
      index += 2;
      continue;
    }

    if (source[index] === quote) {
      return index + 1;
    }

    index += 1;
  }

  return source.length;
}

export function tokenizeCode(source: string): CodeToken[] {
  const tokens: CodeToken[] = [];
  let index = 0;
  let inJsxTag = false;
  let isReadingTagName = false;
  let jsxExpressionDepth = 0;

  while (index < source.length) {
    const character = source[index];
    const nextCharacter = source[index + 1];

    if (character === '/' && nextCharacter === '/') {
      const lineEnd = source.indexOf('\n', index);
      const tokenEnd = lineEnd === -1 ? source.length : lineEnd;
      pushToken(tokens, 'comment', source.slice(index, tokenEnd));
      index = tokenEnd;
      continue;
    }

    if (character === '/' && nextCharacter === '*') {
      const commentEnd = source.indexOf('*/', index + 2);
      const tokenEnd = commentEnd === -1 ? source.length : commentEnd + 2;
      pushToken(tokens, 'comment', source.slice(index, tokenEnd));
      index = tokenEnd;
      continue;
    }

    if (character === '"' || character === "'" || character === '`') {
      const tokenEnd = readQuotedValue(source, index);
      pushToken(tokens, 'string', source.slice(index, tokenEnd));
      index = tokenEnd;
      continue;
    }

    if (isDigit(character)) {
      let tokenEnd = index + 1;

      while (/[\d._]/u.test(source[tokenEnd] ?? '')) {
        tokenEnd += 1;
      }

      pushToken(tokens, 'number', source.slice(index, tokenEnd));
      index = tokenEnd;
      continue;
    }

    const punctuation = multiCharacterPunctuation.find((value) =>
      source.startsWith(value, index),
    );

    if (punctuation) {
      pushToken(tokens, 'punctuation', punctuation);

      if (punctuation === '</') {
        inJsxTag = true;
        isReadingTagName = true;
        jsxExpressionDepth = 0;
      } else if (punctuation === '/>') {
        inJsxTag = false;
        isReadingTagName = false;
        jsxExpressionDepth = 0;
      }

      index += punctuation.length;
      continue;
    }

    if (character === '<' && (isIdentifierStart(nextCharacter) || nextCharacter === '>')) {
      pushToken(tokens, 'punctuation', character);
      inJsxTag = true;
      isReadingTagName = nextCharacter !== '>';
      jsxExpressionDepth = 0;
      index += 1;
      continue;
    }

    if (character === '>' && jsxExpressionDepth === 0) {
      pushToken(tokens, 'punctuation', character);
      inJsxTag = false;
      isReadingTagName = false;
      index += 1;
      continue;
    }

    if (inJsxTag && jsxExpressionDepth === 0 && /\s/u.test(character ?? '')) {
      isReadingTagName = false;
    }

    if (isIdentifierStart(character)) {
      let tokenEnd = index + 1;

      while (isIdentifierPart(source[tokenEnd], inJsxTag)) {
        tokenEnd += 1;
      }

      const value = source.slice(index, tokenEnd);
      const nextTokenIndex = nextNonWhitespaceIndex(source, tokenEnd);
      let kind: CodeTokenKind = 'plain';

      if (isReadingTagName) {
        kind = 'tag';
      } else if (inJsxTag && jsxExpressionDepth === 0) {
        kind = 'attribute';
      } else if (keywords.has(value)) {
        kind = 'keyword';
      } else if (source[nextTokenIndex] === '(') {
        kind = 'function';
      }

      pushToken(tokens, kind, value);
      index = tokenEnd;
      continue;
    }

    if (inJsxTag && character === '{') {
      jsxExpressionDepth += 1;
    } else if (inJsxTag && character === '}' && jsxExpressionDepth > 0) {
      jsxExpressionDepth -= 1;
    }

    const kind: CodeTokenKind = /[{}()[\].,;:=+\-*?!]/u.test(character ?? '')
      ? 'punctuation'
      : 'plain';
    pushToken(tokens, kind, character ?? '');
    index += 1;
  }

  return tokens;
}
