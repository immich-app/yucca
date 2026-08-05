// Grammar for the client-evaluated `connections_math` expression:
//   expr   := term (('+' | '-') term)*
//   term   := factor (('*' | '/') factor)*
//   factor := integer | 'cores' | ('min' | 'max') '(' expr ',' expr ')' | '(' expr ')'
// Clients substitute their local CPU count for `cores`; on parse failure they fall back to a default.

type Token = { kind: 'number'; value: number } | { kind: 'ident'; value: string } | { kind: 'symbol'; value: string };

const tokenize = (input: string): Token[] => {
  const tokens: Token[] = [];
  let i = 0;
  while (i < input.length) {
    const char = input[i];
    if (/\s/.test(char)) {
      i++;
    } else if (/\d/.test(char)) {
      let j = i;
      while (j < input.length && /\d/.test(input[j])) {
        j++;
      }
      tokens.push({ kind: 'number', value: Number.parseInt(input.slice(i, j), 10) });
      i = j;
    } else if (/[a-z]/.test(char)) {
      let j = i;
      while (j < input.length && /[a-z]/.test(input[j])) {
        j++;
      }
      tokens.push({ kind: 'ident', value: input.slice(i, j) });
      i = j;
    } else if ('+-*/(),'.includes(char)) {
      tokens.push({ kind: 'symbol', value: char });
      i++;
    } else {
      throw new Error(`Unexpected character '${char}' in connections_math expression`);
    }
  }
  return tokens;
};

class Parser {
  private position = 0;

  constructor(
    private readonly tokens: Token[],
    private readonly cores: number,
  ) {}

  parse(): number {
    const value = this.expr();
    if (this.position < this.tokens.length) {
      throw new Error('Unexpected trailing tokens in connections_math expression');
    }
    return value;
  }

  private expr(): number {
    let value = this.term();
    while (this.peekSymbol('+') || this.peekSymbol('-')) {
      const op = this.next();
      value = op.value === '+' ? value + this.term() : value - this.term();
    }
    return value;
  }

  private term(): number {
    let value = this.factor();
    while (this.peekSymbol('*') || this.peekSymbol('/')) {
      const op = this.next();
      value = op.value === '*' ? value * this.factor() : value / this.factor();
    }
    return value;
  }

  private factor(): number {
    const token = this.next();
    if (token.kind === 'number') {
      return token.value;
    }
    if (token.kind === 'ident') {
      if (token.value === 'cores') {
        return this.cores;
      }
      if (token.value === 'min' || token.value === 'max') {
        this.expectSymbol('(');
        const left = this.expr();
        this.expectSymbol(',');
        const right = this.expr();
        this.expectSymbol(')');
        return token.value === 'min' ? Math.min(left, right) : Math.max(left, right);
      }
      throw new Error(`Unknown identifier '${token.value}' in connections_math expression`);
    }
    if (token.kind === 'symbol' && token.value === '(') {
      const value = this.expr();
      this.expectSymbol(')');
      return value;
    }
    throw new Error(`Unexpected token '${token.value}' in connections_math expression`);
  }

  private next(): Token {
    const token = this.tokens[this.position++];
    if (!token) {
      throw new Error('Unexpected end of connections_math expression');
    }
    return token;
  }

  private peekSymbol(symbol: string): boolean {
    const token = this.tokens[this.position];
    return token?.kind === 'symbol' && token.value === symbol;
  }

  private expectSymbol(symbol: string): void {
    const token = this.next();
    if (token.kind !== 'symbol' || token.value !== symbol) {
      throw new Error(`Expected '${symbol}' in connections_math expression`);
    }
  }
}

export const evaluateConnectionsMath = (expression: string, cores: number): number => {
  const result = new Parser(tokenize(expression), cores).parse();
  if (!Number.isFinite(result)) {
    throw new TypeError('connections_math expression did not evaluate to a finite number');
  }
  return result;
};

export const isValidConnectionsMath = (expression: string): boolean => {
  try {
    evaluateConnectionsMath(expression, 1);
    return true;
  } catch {
    return false;
  }
};
