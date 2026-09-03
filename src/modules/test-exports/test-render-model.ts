import { TestRenderMode } from './test-export.enums';
export interface RenderOption {
  label: string;
  text: string;
}
export interface RenderQuestion {
  number: number;
  type: string;
  text: string;
  marks: number;
  difficulty: string;
  options: RenderOption[];
  answer?: string;
  explanation?: string | null;
}
export interface TestRenderModel {
  mode: TestRenderMode;
  test: {
    title: string;
    description: string | null;
    instructions: string | null;
    language: string;
    durationMinutes: number | null;
    totalMarks: number;
    totalQuestions: number;
    finalizedAt: Date;
  };
  curriculum: { board: string; className: string; section: string | null; subject: string };
  institution: {
    name: string | null;
    logo?: Buffer;
    address?: string | null;
    phone?: string | null;
    email?: string | null;
    website?: string | null;
    footer?: string | null;
  };
  teacher: { displayName: string };
  questions: RenderQuestion[];
}
export const PDF_RENDERER = Symbol('PDF_RENDERER');
export interface PdfRenderer {
  render(model: TestRenderModel): Promise<Buffer>;
}
