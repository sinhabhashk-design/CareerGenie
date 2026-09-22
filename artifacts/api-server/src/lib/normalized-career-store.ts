import { randomUUID } from "node:crypto";
import {
  supabaseInsert,
  supabaseList,
  supabaseUpdate,
} from "./supabase";
import {
  downloadResumeObject,
  isResumeObjectPathForUser,
} from "./objectStorage";
import {
  extractResume,
  ResumeExtractionError,
  type ParsedResumeData,
} from "./resume-extraction";

export type Status =
  | "saved"
  | "applied"
  | "screening"
  | "interview"
  | "offer"
  | "rejected"
  | "withdrawn";

export type RecommendationStatus = "pending" | "accepted" | "rejected";

export type Application = {
  id: string;
  jobTitle: string;
  companyName: string;
  location: string;
  status: Status;
  matchScore: number;
  cvVersion: string | null;
  appliedDate?: string | null;
  updatedAt: string;
  initials: string;
  accent: string;
};

export type ApplicationDetail = Application & {
  summary: string;
  strengths: string[];
  gaps: string[];
  scoreBreakdown: Record<string, number>;
  jobDescription: string;
  resumeName: string;
  acceptedCount: number;
  rejectedCount: number;
};

export type Recommendation = {
  id: string;
  applicationId: string;
  section: string;
  originalText: string;
  suggestedText: string;
  reason: string;
  evidence: string[];
  alignment: string[];
  risk: "low" | "medium" | "high";
  status: RecommendationStatus;
};

export type SavedResume = {
  id: string;
  name: string;
  fileUrl: string | null;
  fileType: string | null;
  createdAt: string;
  isMaster: boolean;
};

type JsonRecord = Record<string, unknown>;

type ResumeRow = {
  id: string;
  user_id: string;
  name: string;
  file_url: string | null;
  file_type: string | null;
  raw_text: string | null;
  parsed_data: JsonRecord;
  is_master: boolean;
  created_at: string;
};

type JobRow = {
  id: string;
  user_id: string;
  company: string;
  job_title: string;
  job_url: string | null;
  job_description: string | null;
  parsed_data: JsonRecord;
  created_at: string;
};

type AnalysisRow = {
  id: string;
  job_id: string;
  resume_id: string;
  match_score: number;
  strengths: string[];
  skill_gaps: string[];
  missing_keywords: string[];
  matched_keywords: string[];
  analysis_json: JsonRecord;
  created_at: string;
};

type RecommendationRow = {
  id: string;
  analysis_id: string;
  resume_section: string;
  original_text: string;
  suggested_text: string;
  reason: string;
  status: RecommendationStatus;
  created_at: string;
};

type CvVersionRow = {
  id: string;
  user_id: string;
  job_id: string;
  parent_resume_id: string | null;
  version_number: number;
  file_url: string | null;
  changes_json: JsonRecord;
  created_at: string;
};

type ApplicationRow = {
  id: string;
  user_id: string;
  job_id: string;
  cv_version_id: string | null;
  status: Status;
  applied_date: string | null;
  notes: string | null;
  created_at: string;
};

type InterviewRow = {
  id: string;
  application_id: string;
  type: string;
  status: string;
  score: number | null;
  feedback: string | null;
  created_at: string;
};

type InterviewQuestionRow = {
  id: string;
  interview_id: string;
  question: string;
  category: string | null;
  difficulty: string | null;
  expected_topics: string[];
};

const masterResumeData = {
  summary: "Career profile ready for role-specific tailoring.",
  skills: ["Automation", "API integration", "Stakeholder partnership"],
  experience: [],
  education: [],
  certifications: [],
  achievements: [],
};

const seededTargets = [
  {
    jobTitle: "RPA Solution Architect",
    companyName: "ABC Technologies",
    location: "Bengaluru · Hybrid",
    status: "interview" as Status,
    matchScore: 91,
    accent: "#8C7EE5",
    summary:
      "Lead enterprise automation architecture across finance and operations. The role values platform thinking, API fluency, and the ability to turn ambiguous process problems into reliable systems.",
    strengths: ["UiPath", "RPA", "API integration", "Automation design"],
    gaps: ["Azure", "Cloud architecture", "Power Automate"],
    scoreBreakdown: {
      Skills: 88,
      Experience: 85,
      Responsibilities: 78,
      Keywords: 72,
      Education: 90,
      Certifications: 80,
    },
    jobDescription:
      "ABC Technologies is looking for an RPA Solution Architect to design scalable automation platforms, partner with engineering teams, and establish resilient monitoring and exception handling patterns.",
    recommendations: [
      {
        section: "Professional summary",
        originalText: "Worked on UiPath automation projects.",
        suggestedText:
          "Designed and implemented UiPath automation solutions across multiple business processes.",
        reason:
          "Creates a stronger connection to the role's automation architecture requirement without adding new claims.",
        status: "accepted" as RecommendationStatus,
      },
      {
        section: "Selected experience",
        originalText: "Integrated APIs for business workflows.",
        suggestedText:
          "Integrated APIs to connect business workflows and reduce manual handoffs between systems.",
        reason:
          "Makes your existing integration work easier to scan against the platform and API responsibilities.",
        status: "pending" as RecommendationStatus,
      },
      {
        section: "Project detail",
        originalText: "Built automation workflows for operations teams.",
        suggestedText:
          "Built automation workflows for operations teams, partnering with stakeholders from discovery through rollout.",
        reason:
          "Surfaces the cross-functional ownership the role expects.",
        status: "pending" as RecommendationStatus,
      },
    ],
  },
  {
    jobTitle: "Automation Lead",
    companyName: "Orbit Systems",
    location: "Remote · India",
    status: "screening" as Status,
    matchScore: 84,
    accent: "#77B5A5",
    summary:
      "Own automation programs from discovery to rollout, with a strong focus on measurable outcomes and reusable platform foundations.",
    strengths: ["Process mapping", "UiPath", "Stakeholder leadership"],
    gaps: ["Cloud security", "Power Automate"],
    scoreBreakdown: {
      Skills: 84,
      Experience: 80,
      Responsibilities: 86,
      Keywords: 71,
      Education: 88,
      Certifications: 68,
    },
    jobDescription:
      "Orbit Systems is hiring an Automation Lead to build repeatable automation programs across its customer operations organization.",
    recommendations: [
      {
        section: "Professional summary",
        originalText: "Automation professional with experience in UiPath.",
        suggestedText:
          "Automation professional who translates complex operational needs into repeatable UiPath solutions.",
        reason:
          "Leads with the outcome and systems perspective Orbit Systems is screening for.",
        status: "pending" as RecommendationStatus,
      },
    ],
  },
  {
    jobTitle: "Platform Engineer",
    companyName: "Northstar Labs",
    location: "Pune · On-site",
    status: "saved" as Status,
    matchScore: 76,
    accent: "#DBB35A",
    summary:
      "A platform engineering role with a focus on reliable internal tools and integration patterns.",
    strengths: ["API integration", "Systems thinking"],
    gaps: ["Kubernetes", "Observability"],
    scoreBreakdown: {
      Skills: 76,
      Experience: 72,
      Responsibilities: 74,
      Keywords: 66,
      Education: 90,
      Certifications: 60,
    },
    jobDescription:
      "Northstar Labs is hiring a Platform Engineer to build dependable developer tooling and service integrations.",
    recommendations: [],
  },
];

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function record(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function applicationId(value: ApplicationRow) {
  return value.id;
}

async function masterResume(userId: string) {
  const existing = await supabaseList<ResumeRow>(
    "resumes",
    { user_id: `eq.${userId}`, is_master: "eq.true", order: "created_at.asc", limit: "1" },
    "*",
    userId,
  );
  if (existing[0]) return existing[0];
  const [created] = await supabaseInsert<ResumeRow>(
    "resumes",
    {
      user_id: userId,
      name: "Master resume",
      file_type: "text/plain",
      parsed_data: masterResumeData,
      is_master: true,
    },
    userId,
  );
  if (!created) throw new Error("Supabase did not return the master resume");
  return created;
}

async function resumeForApplication(
  userId: string,
  input: {
    resumeId?: string | null;
    resumeName?: string | null;
    resumeFileUrl?: string | null;
    resumeFileType?: string | null;
    resumeRawText?: string | null;
    resumeParsedData?: JsonRecord | null;
  },
) {
  if (input.resumeId) {
    const existing = await supabaseList<ResumeRow>(
      "resumes",
      { user_id: `eq.${userId}`, id: `eq.${input.resumeId}` },
      "*",
      userId,
    );
    if (!existing[0]) throw new Error("Selected resume was not found");
    return existing[0];
  }

  if (input.resumeFileUrl) {
    if (!isResumeObjectPathForUser(input.resumeFileUrl, userId)) {
      throw new Error("Uploaded resume has an invalid storage path");
    }
    let extracted: {
      rawText: string;
      parsedData: ParsedResumeData;
    };
    try {
      const buffer = await downloadResumeObject(input.resumeFileUrl, userId);
      extracted = await extractResume({
        buffer,
        fileName: input.resumeName?.trim() || "Uploaded CV",
        contentType: input.resumeFileType || "application/octet-stream",
      });
    } catch (error) {
      if (error instanceof ResumeExtractionError) throw error;
      throw new ResumeExtractionError(
        "We couldn't process your uploaded CV. Check the file and try again.",
        { cause: error },
      );
    }
    const [created] = await supabaseInsert<ResumeRow>(
      "resumes",
      {
        user_id: userId,
        name: input.resumeName?.trim() || "Uploaded CV",
        file_url: input.resumeFileUrl,
        file_type: input.resumeFileType || "application/octet-stream",
        raw_text: extracted.rawText,
        parsed_data: extracted.parsedData,
        is_master: false,
      },
      userId,
    );
    if (!created) throw new Error("Supabase did not return the uploaded resume");
    return created;
  }

  return masterResume(userId);
}

async function createTarget(
  userId: string,
  target: (typeof seededTargets)[number],
  resume: ResumeRow,
  createCvVersion: boolean,
) {
  const [job] = await supabaseInsert<JobRow>(
    "jobs",
    {
      user_id: userId,
      company: target.companyName,
      job_title: target.jobTitle,
      job_description: target.jobDescription,
      parsed_data: { location: target.location, accent: target.accent },
    },
    userId,
  );
  if (!job) throw new Error("Supabase did not return the seeded job");

  const [analysis] = await supabaseInsert<AnalysisRow>(
    "job_cv_analysis",
    {
      job_id: job.id,
      resume_id: resume.id,
      match_score: target.matchScore,
      strengths: target.strengths,
      skill_gaps: target.gaps,
      missing_keywords: target.gaps,
      matched_keywords: target.strengths,
      analysis_json: {
        summary: target.summary,
        score_breakdown: target.scoreBreakdown,
      },
    },
    userId,
  );
  if (!analysis) throw new Error("Supabase did not return the job analysis");

  await supabaseInsert(
    "recommendations",
    target.recommendations.map((recommendation) => ({
      analysis_id: analysis.id,
      resume_section: recommendation.section,
      original_text: recommendation.originalText,
      suggested_text: recommendation.suggestedText,
      reason: recommendation.reason,
      status: recommendation.status,
    })),
    userId,
  );

  let cvVersion: CvVersionRow | undefined;
  if (createCvVersion) {
    [cvVersion] = await supabaseInsert<CvVersionRow>(
      "cv_versions",
      {
        user_id: userId,
        job_id: job.id,
        parent_resume_id: resume.id,
        version_number: 1,
        changes_json: { source: "initial workspace setup" },
      },
      userId,
    );
  }

  const [application] = await supabaseInsert<ApplicationRow>(
    "applications",
    {
      user_id: userId,
      job_id: job.id,
      cv_version_id: cvVersion?.id ?? null,
      status: target.status,
      applied_date:
        target.status === "interview" ? new Date().toISOString() : null,
      notes: null,
    },
    userId,
  );
  if (!application) throw new Error("Supabase did not return the application");
  return application;
}

export async function ensureWorkspace(userId: string) {
  const existing = await supabaseList<ApplicationRow>(
    "applications",
    { user_id: `eq.${userId}`, select: "id", limit: "1" },
    "id",
    userId,
  );
  if (existing.length > 0) return;

  const resume = await masterResume(userId);
  for (const [index, target] of seededTargets.entries()) {
    await createTarget(userId, target, resume, index === 0);
  }
}

async function getApplicationRow(userId: string, id: string) {
  const rows = await supabaseList<ApplicationRow>(
    "applications",
    { user_id: `eq.${userId}`, id: `eq.${id}` },
    "*",
    userId,
  );
  return rows[0];
}

async function getApplicationContext(userId: string, id: string) {
  const application = await getApplicationRow(userId, id);
  if (!application) return undefined;

  const [job, version] = await Promise.all([
    supabaseList<JobRow>(
      "jobs",
      { user_id: `eq.${userId}`, id: `eq.${application.job_id}` },
      "*",
      userId,
    ).then((rows) => rows[0]),
    application.cv_version_id
      ? supabaseList<CvVersionRow>(
          "cv_versions",
          { user_id: `eq.${userId}`, id: `eq.${application.cv_version_id}` },
          "*",
          userId,
        ).then((rows) => rows[0])
      : Promise.resolve(undefined),
  ]);
  if (!job) return undefined;

  const [analysis] = await supabaseList<AnalysisRow>(
    "job_cv_analysis",
    { job_id: `eq.${job.id}`, order: "created_at.desc", limit: "1" },
    "*",
    userId,
  );
  const resume = analysis
    ? (
        await supabaseList<ResumeRow>(
          "resumes",
          { user_id: `eq.${userId}`, id: `eq.${analysis.resume_id}` },
          "*",
          userId,
        )
      )[0]
    : undefined;
  const recommendations = analysis
    ? await supabaseList<RecommendationRow>(
        "recommendations",
        { analysis_id: `eq.${analysis.id}`, order: "created_at.asc" },
        "*",
        userId,
      )
    : [];

  return { application, job, analysis, resume, version, recommendations };
}

function toApplication(
  application: ApplicationRow,
  job: JobRow,
  analysis?: AnalysisRow,
  version?: CvVersionRow,
): Application {
  const parsedJob = record(job.parsed_data);
  return {
    id: applicationId(application),
    jobTitle: job.job_title,
    companyName: job.company,
    location:
      typeof parsedJob.location === "string"
        ? parsedJob.location
        : "Location flexible",
    status: application.status,
    matchScore: analysis?.match_score ?? 0,
    cvVersion: version ? `v${version.version_number}` : null,
    appliedDate: application.applied_date,
    updatedAt: application.created_at,
    initials: job.company.slice(0, 2).toUpperCase(),
    accent:
      typeof parsedJob.accent === "string" ? parsedJob.accent : "#8C7EE5",
  };
}

function toDetail(context: NonNullable<Awaited<ReturnType<typeof getApplicationContext>>>) {
  const analysisData = record(context.analysis?.analysis_json);
  const summary =
    typeof analysisData.summary === "string"
      ? analysisData.summary
      : "This workspace is ready for a clearer read of your fit.";
  const breakdown = record(analysisData.score_breakdown);
  const scoreBreakdown = Object.fromEntries(
    Object.entries(breakdown).filter(
      ([, value]) => typeof value === "number" && Number.isInteger(value),
    ),
  ) as Record<string, number>;
  const base = toApplication(
    context.application,
    context.job,
    context.analysis,
    context.version,
  );
  return {
    ...base,
    summary,
    strengths: asStringArray(context.analysis?.strengths),
    gaps: asStringArray(context.analysis?.skill_gaps),
    scoreBreakdown,
    jobDescription: context.job.job_description || "",
    resumeName: context.resume?.name || "Master resume",
    acceptedCount: context.recommendations.filter((item) => item.status === "accepted").length,
    rejectedCount: context.recommendations.filter((item) => item.status === "rejected").length,
  } satisfies ApplicationDetail;
}

export async function listApplications(userId: string) {
  const rows = await supabaseList<ApplicationRow>(
    "applications",
    { user_id: `eq.${userId}`, order: "created_at.desc" },
    "*",
    userId,
  );
  const contexts = await Promise.all(
    rows.map((row) => getApplicationContext(userId, row.id)),
  );
  return contexts
    .filter((context): context is NonNullable<typeof context> => Boolean(context))
    .map((context) =>
      toApplication(
        context.application,
        context.job,
        context.analysis,
        context.version,
      ),
    );
}

export async function getApplication(userId: string, id: string) {
  const context = await getApplicationContext(userId, id);
  return context ? toDetail(context) : undefined;
}

export async function createApplication(
  userId: string,
  input: {
    jobTitle: string;
    companyName: string;
    location?: string | null;
    sourceUrl?: string | null;
    description?: string | null;
    resumeId?: string | null;
    resumeName?: string | null;
    resumeFileUrl?: string | null;
    resumeFileType?: string | null;
    resumeRawText?: string | null;
    resumeParsedData?: JsonRecord | null;
  },
) {
  const resume = await resumeForApplication(userId, input);
  const [job] = await supabaseInsert<JobRow>(
    "jobs",
    {
      user_id: userId,
      company: input.companyName,
      job_title: input.jobTitle,
      job_url: input.sourceUrl || null,
      job_description: input.description || "",
      parsed_data: { location: input.location || "Location flexible", accent: "#8C7EE5" },
    },
    userId,
  );
  if (!job) throw new Error("Supabase did not return the new job");

  const [analysis] = await supabaseInsert<AnalysisRow>(
    "job_cv_analysis",
    {
      job_id: job.id,
      resume_id: resume.id,
      match_score: 82,
      strengths: ["Target role captured", "CV context connected"],
      skill_gaps: ["Analysis pending"],
      missing_keywords: [],
      matched_keywords: [],
      analysis_json: {
        summary:
          "Your new role workspace is ready. Once the job description and CV are processed, CareerGenie will surface strengths, gaps, and evidence-backed recommendations.",
        score_breakdown: {
          Skills: 82,
          Experience: 82,
          Responsibilities: 82,
          Keywords: 82,
          Education: 82,
          Certifications: 82,
        },
      },
    },
    userId,
  );
  if (!analysis) throw new Error("Supabase did not return the new analysis");

  const [cvVersion] = await supabaseInsert<CvVersionRow>(
    "cv_versions",
    {
      user_id: userId,
      job_id: job.id,
      parent_resume_id: resume.id,
      version_number: 1,
      file_url: resume.file_url,
      changes_json: { source: "selected resume" },
    },
    userId,
  );

  const [application] = await supabaseInsert<ApplicationRow>(
    "applications",
    {
      user_id: userId,
      job_id: job.id,
      cv_version_id: cvVersion?.id ?? null,
      status: "saved",
      applied_date: null,
      notes: null,
    },
    userId,
  );
  if (!application) throw new Error("Supabase did not return the new application");
  return toApplication(application, job, analysis);
}

export async function updateApplication(
  userId: string,
  id: string,
  status: Status,
) {
  const rows = await supabaseUpdate<ApplicationRow>(
    "applications",
    { user_id: `eq.${userId}`, id: `eq.${id}` },
    {
      status,
      applied_date: status === "applied" ? new Date().toISOString() : undefined,
    },
    userId,
  );
  if (!rows[0]) return undefined;
  return getApplication(userId, rows[0].id);
}

function toRecommendation(
  row: RecommendationRow,
  applicationId: string,
): Recommendation {
  return {
    id: row.id,
    applicationId,
    section: row.resume_section,
    originalText: row.original_text,
    suggestedText: row.suggested_text,
    reason: row.reason,
    evidence: [],
    alignment: [],
    risk: "low",
    status: row.status,
  };
}

export async function listRecommendations(userId: string, applicationId: string) {
  const context = await getApplicationContext(userId, applicationId);
  if (!context?.analysis) return [];
  return context.recommendations.map((row) =>
    toRecommendation(row, applicationId),
  );
}

export async function updateRecommendation(
  userId: string,
  id: string,
  status: RecommendationStatus,
) {
  const rows = await supabaseList<RecommendationRow>(
    "recommendations",
    { id: `eq.${id}` },
    "*",
    userId,
  );
  const recommendation = rows[0];
  if (!recommendation) return undefined;

  const analyses = await supabaseList<AnalysisRow>(
    "job_cv_analysis",
    { id: `eq.${recommendation.analysis_id}` },
    "*",
    userId,
  );
  const analysis = analyses[0];
  if (!analysis) return undefined;
  const applicationRows = await supabaseList<ApplicationRow>(
    "applications",
    { user_id: `eq.${userId}`, job_id: `eq.${analysis.job_id}`, limit: "1" },
    "*",
    userId,
  );
  if (!applicationRows[0]) return undefined;

  const updated = await supabaseUpdate<RecommendationRow>(
    "recommendations",
    { id: `eq.${id}` },
    { status },
    userId,
  );
  return updated[0]
    ? toRecommendation(updated[0], applicationRows[0].id)
    : undefined;
}

export async function createInterview(userId: string, applicationId: string) {
  const application = await getApplicationRow(userId, applicationId);
  if (!application) return undefined;
  const [interview] = await supabaseInsert<InterviewRow>(
    "interviews",
    {
      application_id: application.id,
      type: "mock",
      status: "in_progress",
    },
    userId,
  );
  return interview?.id;
}

export async function createInterviewQuestion(
  userId: string,
  interviewId: string,
  question: {
    question: string;
    category: string;
    difficulty: string;
    preparationSignals: string[];
  },
) {
  const interview = await getInterview(userId, interviewId);
  if (!interview) return undefined;
  const [created] = await supabaseInsert<InterviewQuestionRow>(
    "interview_questions",
    {
      interview_id: interview.id,
      question: question.question,
      category: question.category,
      difficulty: question.difficulty,
      expected_topics: question.preparationSignals,
    },
    userId,
  );
  return created;
}

export async function getInterview(userId: string, id: string) {
  const rows = await supabaseList<InterviewRow>(
    "interviews",
    { id: `eq.${id}` },
    "*",
    userId,
  );
  const interview = rows[0];
  if (!interview) return undefined;
  const application = await getApplicationRow(userId, interview.application_id);
  if (!application) return undefined;
  const questions = await supabaseList<InterviewQuestionRow>(
    "interview_questions",
    { interview_id: `eq.${id}`, order: "created_at.asc" },
    "*",
    userId,
  );
  return {
    ...interview,
    question_index: questions.length,
    application_id: application.id,
  };
}

export async function advanceInterview(
  userId: string,
  id: string,
  applicationId: string,
  answer: string,
  score: number,
  strengths: string[],
  improvements: string[],
) {
  const interview = await getInterview(userId, id);
  if (!interview || interview.application_id !== applicationId) return undefined;
  const questions = await supabaseList<InterviewQuestionRow>(
    "interview_questions",
    { interview_id: `eq.${id}`, order: "created_at.asc" },
    "*",
    userId,
  );
  const question = questions[questions.length - 1];
  if (!question) return undefined;
  await supabaseInsert(
    "interview_answers",
    {
      question_id: question.id,
      answer,
      score,
      strengths,
      improvements,
      feedback: improvements.join(" "),
    },
    userId,
  );
  await supabaseUpdate(
    "interviews",
    { id: `eq.${id}` },
    {
      score,
      status: "in_progress",
      feedback: improvements.join(" "),
    },
    userId,
  );
  return { question_index: questions.length };
}