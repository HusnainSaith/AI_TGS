import { ConfigService } from '@nestjs/config';
import { PDFDocument } from 'pdf-lib';
import { PdfLibRenderer } from '../src/modules/test-exports/pdf-lib-renderer.service';
import { TestRenderMode } from '../src/modules/test-exports/test-export.enums';
import { TestRenderModel } from '../src/modules/test-exports/test-render-model';

const model = (mode: TestRenderMode, count = 1): TestRenderModel => ({
  mode,
  test: {
    title: 'Algebra Test',
    description: null,
    instructions: 'Read carefully.',
    language: 'en',
    durationMinutes: 60,
    totalMarks: count,
    totalQuestions: count,
    finalizedAt: new Date('2026-01-01T00:00:00Z'),
  },
  curriculum: { board: 'Board', className: 'Class 9', section: 'A', subject: 'Math' },
  institution: {
    name: 'Example School',
    address: '1 Learning Road',
    phone: '555-0100',
    email: 'office@example.test',
    website: 'school.example',
    footer: 'Excellence in learning',
  },
  teacher: { displayName: 'Teacher' },
  questions: Array.from({ length: count }, (_, index) => ({
    number: index + 1,
    type: 'MCQ',
    text: `What is 2 + 2? item ${index + 1}`,
    marks: 1,
    difficulty: 'EASY',
    options: [
      { label: 'A', text: '3' },
      { label: 'B', text: '4' },
      { label: 'C', text: '5' },
      { label: 'D', text: '6' },
    ],
    ...(mode === TestRenderMode.ANSWER_KEY ? { answer: 'B. 4', explanation: 'Addition' } : {}),
  })),
});

describe('PDF renderer', () => {
  const renderer = new PdfLibRenderer({ get: jest.fn() } as unknown as ConfigService);
  it('creates a structurally valid question paper without answer markers', async () => {
    const buffer = await renderer.render(model(TestRenderMode.QUESTION_PAPER));
    expect(buffer.subarray(0, 5).toString()).toBe('%PDF-');
    const document = await PDFDocument.load(buffer);
    expect(document.getPageCount()).toBe(1);
    expect(document.getTitle()).toBe('Algebra Test');
  });
  it('renders answer data and valid multi-page output', async () => {
    const buffer = await renderer.render(model(TestRenderMode.ANSWER_KEY, 55));
    const document = await PDFDocument.load(buffer);
    expect(document.getPageCount()).toBeGreaterThan(1);
    expect(document.getTitle()).toBe('Algebra Test');
  });
});
