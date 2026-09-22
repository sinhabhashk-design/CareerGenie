import { PDFParse } from "pdf-parse";
import mammoth from "mammoth";

const MAX_RESUME_TEXT_LENGTH = 50_000;

export type ResumeSection =
  | "summary"
  | "skills"
  | "experience"
  | "education"
  | "certifications"
  | "achievements";

export type ParsedResumeData = {
  summary: string;
  skills: string[];
  experience: string[];
  education: string[];
  certifications: string[];
  achievements: string[];
  sections: Record<ResumeSection, string[]>;
  extraction: {
    format: "pdf" | "docx" | "txt";
    characterCount: number;
  };
};

export class ResumeExtractionError extends Error {
  readonly code = "resume_processing_failed";

  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "ResumeExtractionError";
  }
}

const SECTION_ALIASES: Record<ResumeSection, string[]> = {
  summary: [
    "summary",
    "professional summary",
    "profile",
    "professional profile",
    "about me",
    "objective",
    "career objective",
  ],
  skills: [
    "skills",
    "technical skills",
    "core skills",
    "key skills",
    "competencies",
    "core competencies",
    "technologies",
  ],
  experience: [
    "experience",
    "work experience",
    "professional experience",
    "employment history",
    "work history",
    "career history",
  ],
  education: [
    "education",
    "academic background",
    "academic history",
    "qualifications",
  ],
  certifications: [
    "certifications",
    "certificates",
    "licenses",
    "licenses and certifications",
  ],
  achievements: [
    "achievements",
    "awards",
    "accomplishments",
    "honors",
  ],
};

function emptySections(): Record<ResumeSection, string[]> {
  return {
    summary: [],
    skills: [],
    experience: [],
    education: [],
    certifications: [],
    achievements: [],
  };
}

function normalizeLine(line: string) {
  return line
    .replace(/\u0000/g, "")
    .replace(/[ \t]+/g, " ")
    .trim();
}

function normalizeText(value: string) {
  return value
    .replace(/\r\n?/g, "\n")
    .replace(/\u0000/g, "")
    .split("\n")
    .map(normalizeLine)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, MAX_RESUME_TEXT_LENGTH);
}

function normalizedHeading(line: string) {
  return line
    .toLowerCase()
    .replace(/^[\s\d.)-]+|[:\s]+$/g, "")
    .replace(/[|/]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function sectionForHeading(line: string): ResumeSection | undefined {
  const heading = normalizedHeading(line);
  if (!heading || heading.length > 64) return undefined;

  for (const [section, aliases] of Object.entries(SECTION_ALIASES) as [
    ResumeSection,
    string[],
  ][]) {
    if (aliases.includes(heading)) return section;
  }
  return undefined;
}

function cleanEntry(line: string) {
  return line.replace(/^(?:[•●▪◦*-]|\d+[.)])\s+/, "").trim();
}

function looksLikeContactLine(line: string) {
  return (
    /@/.test(line) ||
    /https?:\/\//i.test(line) ||
    /\b(?:linkedin|github)\b/i.test(line) ||
    /(?:\+?\d[\d\s().-]{7,}\d)/.test(line)
  );
}

function summaryFromSections(sections: Record<ResumeSection, string[]>) {
  const explicitSummary = sections.summary.filter(
    (line) => !looksLikeContactLine(line),
  );
  const source =
    explicitSummary.length > 0
      ? explicitSummary
      : [...sections.experience, ...sections.skills].filter(
          (line) => !looksLikeContactLine(line),
        );
  return source
    .slice(0, 4)
    .join(" ")
    .replace(/\s+/g, " ")
    .slice(0, 600)
    .trim();
}

export function parseResumeSections(
  rawText: string,
  format: ParsedResumeData["extraction"]["format"],
): ParsedResumeData {
  const sections = emptySections();
  let currentSection: ResumeSection = "summary";

  for (const rawLine of rawText.split("\n")) {
    const line = normalizeLine(rawLine);
    if (!line) continue;

    const heading = sectionForHeading(line);
    if (heading) {
      currentSection = heading;
      continue;
    }

    sections[currentSection].push(cleanEntry(line));
  }

  const summary = summaryFromSections(sections);
  const { summary: _summaryLines, ...sectionArrays } = sections;
  return {
    summary,
    ...sectionArrays,
    sections,
    extraction: {
      format,
      characterCount: rawText.length,
    },
  };
}

function formatForFile(fileName: string, contentType: string) {
  const extension = fileName.toLowerCase().split(".").pop();
  const mime = contentType.toLowerCase().split(";", 1)[0].trim();

  if (mime === "application/pdf" || extension === "pdf") return "pdf" as const;
  if (
    mime ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    extension === "docx"
  ) {
    return "docx" as const;
  }
  if (mime.startsWith("text/") || extension === "txt") return "txt" as const;
  return undefined;
}

async function extractText(buffer: Buffer, format: "pdf" | "docx" | "txt") {
  if (format === "txt") return buffer.toString("utf8");

  if (format === "docx") {
    const result = await mammoth.extractRawText({ buffer });
    const errors = result.messages.filter((message) => message.type === "error");
    if (errors.length > 0) {
      throw new Error(errors.map((message) => message.message).join(" "));
    }
    return result.value;
  }

  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    return result.text;
  } finally {
    await parser.destroy();
  }
}

export async function extractResume({
  buffer,
  fileName,
  contentType,
}: {
  buffer: Buffer;
  fileName: string;
  contentType: string;
}) {
  const format = formatForFile(fileName, contentType);
  if (!format) {
    throw new ResumeExtractionError(
      "This CV format is not supported. Upload a PDF, DOCX, or TXT file.",
    );
  }

  let rawText: string;
  try {
    rawText = normalizeText(await extractText(buffer, format));
  } catch (error) {
    if (error instanceof ResumeExtractionError) throw error;
    throw new ResumeExtractionError(
      `We couldn't read ${fileName}. Check that the file is not corrupted and upload it again.`,
      { cause: error },
    );
  }

  if (rawText.length < 20) {
    throw new ResumeExtractionError(
      format === "pdf"
        ? "This PDF does not contain selectable text. Upload a text-based PDF or DOCX file."
        : `We couldn't find enough readable text in ${fileName}. Upload a different CV file.`,
    );
  }

  return {
    rawText,
    parsedData: parseResumeSections(rawText, format),
  };
}