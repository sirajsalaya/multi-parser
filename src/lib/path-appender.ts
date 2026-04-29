const PUSH = Symbol('path-push');

type PathToken = string | number | typeof PUSH;

type RecordScopeState = {
  activeIndex: number;
  firstLeafPath: string;
  leafPaths: Set<string>;
  canRollOver: boolean;
};

export type AppendContext = {
  recordScopes: Map<string, RecordScopeState>;
};

function isNumericToken(value: string): boolean {
  return /^\d+$/.test(value);
}

function parsePath(input: string): PathToken[] {
  const tokens: PathToken[] = [];
  let current = '';

  const pushCurrent = (): void => {
    if (current.length > 0) {
      tokens.push(current);
      current = '';
    }
  };

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];
    if (char === '.') {
      pushCurrent();
      continue;
    }

    if (char === '[') {
      pushCurrent();
      const end = input.indexOf(']', i + 1);
      if (end === -1) {
        current += input.slice(i);
        break;
      }

      const inside = input.slice(i + 1, end).trim();
      if (inside === '') {
        tokens.push(PUSH);
      } else if (isNumericToken(inside)) {
        tokens.push(Number(inside));
      } else {
        tokens.push(inside);
      }
      i = end;
      continue;
    }

    current += char;
  }

  pushCurrent();
  return tokens;
}

function hasRootArrayToken(tokens: PathToken[]): boolean {
  const firstToken = tokens[0];
  return typeof firstToken === 'number' || firstToken === PUSH;
}

function stringifyTokens(tokens: PathToken[]): string {
  let result = '';

  for (const token of tokens) {
    if (token === PUSH) {
      result += '[]';
      continue;
    }

    if (typeof token === 'number') {
      result += `[${token}]`;
      continue;
    }

    if (result.length === 0) {
      result = token;
      continue;
    }

    if (token.includes('.')) {
      result += `[${token}]`;
      continue;
    }

    result += `.${token}`;
  }

  return result;
}

function isObjectLike(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function createContainer(nextToken: PathToken | undefined): Record<string, unknown> | unknown[] {
  if (typeof nextToken === 'number' || nextToken === PUSH) {
    return [];
  }
  return {};
}

function appendAtLeaf(container: Record<string, unknown> | unknown[], token: PathToken, value: unknown): void {
  if (token === PUSH) {
    if (!Array.isArray(container)) {
      return;
    }
    container.push(value);
    return;
  }

  if (typeof token === 'number') {
    if (!Array.isArray(container)) {
      return;
    }

    const existing = container[token];
    if (existing === undefined) {
      container[token] = value;
      return;
    }
    if (Array.isArray(existing)) {
      existing.push(value);
      return;
    }
    container[token] = [existing, value];
    return;
  }

  const existing = (container as Record<string, unknown>)[token];
  if (existing === undefined) {
    (container as Record<string, unknown>)[token] = value;
    return;
  }
  if (Array.isArray(existing)) {
    existing.push(value);
    return;
  }
  (container as Record<string, unknown>)[token] = [existing, value];
}

function readToken(container: Record<string, unknown> | unknown[], token: PathToken): unknown {
  if (token === PUSH) {
    if (!Array.isArray(container)) {
      return undefined;
    }
    return container[container.length - 1];
  }
  if (typeof token === 'number') {
    return Array.isArray(container) ? container[token] : undefined;
  }
  return (container as Record<string, unknown>)[token];
}

function writeToken(container: Record<string, unknown> | unknown[], token: PathToken, value: unknown): void {
  if (token === PUSH) {
    if (Array.isArray(container)) {
      container.push(value);
    }
    return;
  }
  if (typeof token === 'number') {
    if (Array.isArray(container)) {
      container[token] = value;
    }
    return;
  }
  (container as Record<string, unknown>)[token] = value;
}

function findRecordRoot(tokens: PathToken[]): { rootKey: string; rootIndexPosition: number } | null {
  const rootTokens: PathToken[] = [];

  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i] as PathToken;
    rootTokens.push(token);
    if (typeof token === 'number') {
      const previousToken = i > 0 ? tokens[i - 1] : undefined;
      if (typeof previousToken === 'string') {
        return {
          rootKey: stringifyTokens(rootTokens),
          rootIndexPosition: i,
        };
      }
    }
  }

  return null;
}

function getLeafPath(tokens: PathToken[], rootIndexPosition: number): string {
  return stringifyTokens(tokens.slice(rootIndexPosition + 1));
}

function remapRecordTokens(tokens: PathToken[], context: AppendContext): PathToken[] {
  const recordRoot = findRecordRoot(tokens);
  if (!recordRoot) {
    return tokens;
  }

  const leafPath = getLeafPath(tokens, recordRoot.rootIndexPosition);
  if (leafPath.length === 0) {
    return tokens;
  }

  const existingScope = context.recordScopes.get(recordRoot.rootKey);
  if (!existingScope) {
    context.recordScopes.set(recordRoot.rootKey, {
      activeIndex: tokens[recordRoot.rootIndexPosition] as number,
      firstLeafPath: leafPath,
      leafPaths: new Set([leafPath]),
      canRollOver: false,
    });
    return tokens;
  }

  if (leafPath !== existingScope.firstLeafPath) {
    existingScope.canRollOver = true;
  }

  if (existingScope.canRollOver && leafPath === existingScope.firstLeafPath && existingScope.leafPaths.has(leafPath)) {
    existingScope.activeIndex += 1;
    existingScope.leafPaths.clear();
  }

  const nextIndex = existingScope.activeIndex;
  existingScope.leafPaths.add(leafPath);

  const remappedTokens = [...tokens];
  remappedTokens[recordRoot.rootIndexPosition] = nextIndex;
  return remappedTokens;
}

export function createAppendContext(): AppendContext {
  return {
    recordScopes: new Map(),
  };
}

export function pathStartsWithArray(path: string): boolean {
  return hasRootArrayToken(parsePath(path));
}

export function resolveAppendPath(path: string, context?: AppendContext): string {
  const parsedTokens = parsePath(path);
  const tokens = context ? remapRecordTokens(parsedTokens, context) : parsedTokens;
  return stringifyTokens(tokens);
}

export function appendValueAtPath(target: Record<string, unknown> | unknown[], path: string, value: unknown): void {
  const tokens = parsePath(path);
  if (tokens.length === 0) {
    return;
  }

  let current: Record<string, unknown> | unknown[] = target;
  for (let i = 0; i < tokens.length - 1; i += 1) {
    const token = tokens[i] as PathToken;
    const nextToken = tokens[i + 1] as PathToken;
    let nextValue = readToken(current, token);

    if (!isObjectLike(nextValue)) {
      nextValue = createContainer(nextToken);
      writeToken(current, token, nextValue);
    }

    current = nextValue as Record<string, unknown> | unknown[];
  }

  appendAtLeaf(current, tokens[tokens.length - 1] as PathToken, value);
}
