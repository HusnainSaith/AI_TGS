import { Injectable } from '@nestjs/common';
@Injectable()
export class TextNormalizerService {
  normalize(value: string): string {
    const controlsRemoved = Array.from(value.normalize('NFC'))
      .filter((character) => {
        const code = character.charCodeAt(0);
        return code === 9 || code === 10 || code === 13 || (code >= 32 && code !== 127);
      })
      .join('');
    return controlsRemoved
      .replace(/\r\n?/g, '\n')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }
}
