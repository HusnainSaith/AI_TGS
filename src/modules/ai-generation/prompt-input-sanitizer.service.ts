import { BadRequestException, Injectable } from '@nestjs/common';

@Injectable()
export class PromptInputSanitizer {
  text(value: string, maxLength = 500): string {
    const normalized = value
      .normalize('NFKC')
      .split('')
      .map((character) => (this.control(character) ? ' ' : character))
      .join('')
      .replace(/\s+/g, ' ')
      .trim();
    if (!normalized) throw new BadRequestException('Prompt metadata cannot be empty');
    return normalized.slice(0, maxLength);
  }
  evidence(value: string): string {
    return value
      .normalize('NFKC')
      .split('')
      .map((character) => (this.control(character) ? ' ' : character))
      .join('')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;');
  }
  private control(character: string) {
    const code = character.charCodeAt(0);
    return code === 127 || (code < 32 && code !== 9 && code !== 10 && code !== 13);
  }
}
