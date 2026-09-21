import { randomUUID } from "node:crypto";
import {
  supabaseInsert,
  supabaseList,
  supabaseUpsert,
  supabaseUpdate,
  supabaseAdminRequest,
} from "./supabase";

export type Status =
  | "saved"
  | "cv_tailored"
  | "applied"
  | "interview"
  | "offer"
  | "rejected"
  | "withdrawn";

export const WORKSPACE_COOKIE = "career_genie_workspace";
const WORKSPACE_MAX_AGE = 1000 * 60 * 60 * 24 * 365;

export function getAnonymousWorkspaceKey(req: { cookies?: Record<string, string> }) {
  const current = req.cookies?.[WORKSPACE_COOKIE];
  return typeof current === "string" && /^[0-9a-f-]{20,64}$/i.test(current)
    ? current
    : undefined;
}

export function createAnonymousWorkspaceKey() {
  return randomUUID();
}

export function setAnonymousWorkspaceCookie(
  res: {
    cookie: (
      name: string,
      value: string,
      options: Record<string, unknown>,
    ) => void;
  },
  key: string,
) {
  res.cookie(WORKSPACE_COOKIE, key, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: WORKSPACE_MAX_AGE,
    path: "/",
  });
}

export function clearAnonymousWorkspaceCookie(res: {
  clearCookie: (name: string, options: Record<string, unknown>) => void;
}) {
  res.clearCookie(WORKSPACE_COOKIE, { path: "/" });
}

export async function migrateWorkspace(
  anonymousWorkspaceKey: string,
  userId: string,
) {
  if (anonymousWorkspaceKey === userId) return;
  const tables = [
    "career_workspaces",
    "career_applications",
    "career_recommendations",
    "career_interview_sessions",
  ];
  for (const table of tables) {
    await supabaseAdminRequest(
      `${table}?workspace_key=eq.${encodeURIComponent(anonymousWorkspaceKey)}`,
      {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ workspace_key: userId }),
      },
    );
  }
}

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
  status: "pending" | "accepted" | "rejected";
};

export type User = {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  profileImageUrl: string | null;
};

type UserRow = {
  id: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  profile_image_url: string | null;
  created_at: string;
  updated_at: string;
};

type ApplicationRow = {
  id: string;
  job_title: string;
  company_name: string;
  location: string;
  status: Status;
  match_score: number;
  cv_version: string | null;
  applied_date: string | null;
  updated_at: string;
  initials: string;
  accent: string;
  summary: string;
  strengths: string[];
  gaps: string[];
  score_breakdown: Record<string, number>;
  job_description: string;
  resume_name: string;
  accepted_count: number;
  rejected_count: number;
};

type RecommendationRow = {
  id: string;
  application_id: string;
  section: string;
  original_text: string;
  suggested_text: string;
  reason: string;
  evidence: string[];
  alignment: string[];
  risk: Recommendation["risk"];
  status: Recommendation["status"];
};

type InterviewRow = {
  id: string;
  application_id: string;
  question_index: number;
  answer_count: number;
};

function applicationId(workspaceKey: string, suffix: string) {
  return `app-${workspaceKey.slice(0, 8)}-${suffix}`;
}

function recommendationId(workspaceKey: string, suffix: string) {
  return `rec-${workspaceKey.slice(0, 8)}-${suffix}`;
}

function toApplication(row: ApplicationRow): Application {
  return {
    id: row.id,
    jobTitle: row.job_title,
    companyName: row.company_name,
    location: row.location,
    status: row.status,
    matchScore: row.match_score,
    cvVersion: row.cv_version,
    appliedDate: row.applied_date,
    updatedAt: row.updated_at,
    initials: row.initials,
    accent: row.accent,
  };
}

function toDetail(row: ApplicationRow): ApplicationDetail {
  return {
    ...toApplication(row),
    summary: row.summary,
    strengths: row.strengths || [],
    gaps: row.gaps || [],
    scoreBreakdown: row.score_breakdown || {},
    jobDescription: row.job_description,
    resumeName: row.resume_name,
    acceptedCount: row.accepted_count,
    rejectedCount: row.rejected_count,
  };
}

function toRecommendation(row: RecommendationRow): Recommendation {
  return {
    id: row.id,
    applicationId: row.application_id,
    section: row.section,
    originalText: row.original_text,
    suggestedText: row.suggested_text,
    reason: row.reason,
    evidence: row.evidence || [],
    alignment: row.alignment || [],
    risk: row.risk,
    status: row.status,
  };
}

function toUser(row: UserRow): User {
  return {
    id: row.id,
    email: row.email,
    firstName: row.first_name,
    lastName: row.last_name,
    profileImageUrl: row.profile_image_url,
  };
}

export async function upsertUser(user: User) {
  const [row] = await supabaseUpsert<UserRow>(
    "users",
    {
      id: user.id,
      email: user.email,
      first_name: user.firstName,
      last_name: user.lastName,
      profile_image_url: user.profileImageUrl,
    },
    user.id,
  );
  if (!row) throw new Error("Supabase did not return the stored user");
  return toUser(row);
}

const seedApplications = (workspaceKey: string) => {
  const abcId = applicationId(workspaceKey, "abc");
  const orbitId = applicationId(workspaceKey, "orbit");
  const northId = applicationId(workspaceKey, "north");
  return [
    {
      id: abcId,
      workspace_key: workspaceKey,
      job_title: "RPA Solution Architect",
      company_name: "ABC Technologies",
      location: "Bengaluru · Hybrid",
      status: "interview",
      match_score: 91,
      cv_version: "v1",
      applied_date: "12 Sep 2026",
      initials: "AT",
      accent: "violet",
      summary:
        "Lead enterprise automation architecture across finance and operations. The role values platform thinking, API fluency, and the ability to turn ambiguous process problems into reliable systems.",
      strengths: ["UiPath", "RPA", "API integration", "Automation design"],
      gaps: ["Azure", "Cloud architecture", "Power Automate"],
      score_breakdown: {
        Skills: 88,
        Experience: 85,
        Responsibilities: 78,
        Keywords: 72,
        Education: 90,
        Certifications: 80,
      },
      job_description:
        "ABC Technologies is looking for an RPA Solution Architect to design scalable automation platforms, partner with engineering teams, and establish resilient monitoring and exception handling patterns.",
      resume_name: "Ananya_Tiwari_Resume.pdf",
      accepted_count: 5,
      rejected_count: 2,
    },
    {
      id: orbitId,
      workspace_key: workspaceKey,
      job_title: "Automation Lead",
      company_name: "Orbit Systems",
      location: "Remote · India",
      status: "cv_tailored",
      match_score: 84,
      cv_version: "v2",
      applied_date: null,
      initials: "OS",
      accent: "teal",
      summary:
        "Own automation programs from discovery to rollout, with a strong focus on measurable outcomes and reusable platform foundations.",
      strengths: ["Process mapping", "UiPath", "Stakeholder leadership"],
      gaps: ["Cloud security", "Power Automate"],
      score_breakdown: {
        Skills: 84,
        Experience: 80,
        Responsibilities: 86,
        Keywords: 71,
        Education: 88,
        Certifications: 68,
      },
      job_description:
        "Orbit Systems is hiring an Automation Lead to build repeatable automation programs across its customer operations organization.",
      resume_name: "Ananya_Tiwari_Resume.pdf",
      accepted_count: 3,
      rejected_count: 1,
    },
    {
      id: northId,
      workspace_key: workspaceKey,
      job_title: "Platform Engineer",
      company_name: "Northstar Labs",
      location: "Pune · On-site",
      status: "saved",
      match_score: 76,
      cv_version: null,
      applied_date: null,
      initials: "NL",
      accent: "amber",
      summary:
        "A platform engineering role with a focus on reliable internal tools and integration patterns.",
      strengths: ["API integration", "Systems thinking"],
      gaps: ["Kubernetes", "Observability"],
      score_breakdown: {
        Skills: 76,
        Experience: 72,
        Responsibilities: 74,
        Keywords: 66,
        Education: 90,
        Certifications: 60,
      },
      job_description:
        "Northstar Labs is hiring a Platform Engineer to build dependable developer tooling and service integrations.",
      resume_name: "Ananya_Tiwari_Resume.pdf",
      accepted_count: 0,
      rejected_count: 0,
    },
  ];
};

function seedRecommendations(workspaceKey: string) {
  const abcId = applicationId(workspaceKey, "abc");
  const orbitId = applicationId(workspaceKey, "orbit");
  return [
    {
      id: recommendationId(workspaceKey, "summary"),
      workspace_key: workspaceKey,
      application_id: abcId,
      section: "Professional summary",
      original_text: "Worked on UiPath automation projects.",
      suggested_text:
        "Designed and implemented UiPath automation solutions across multiple business processes.",
      reason:
        "Creates a stronger connection to the role's automation architecture requirement without adding new claims.",
      evidence: ["UiPath experience in your current CV", "Automation projects"],
      alignment: ["UiPath", "Automation", "Architecture"],
      risk: "low",
      status: "accepted",
    },
    {
      id: recommendationId(workspaceKey, "api"),
      workspace_key: workspaceKey,
      application_id: abcId,
      section: "Selected experience",
      original_text: "Integrated APIs for business workflows.",
      suggested_text:
        "Integrated APIs to connect business workflows and reduce manual handoffs between systems.",
      reason:
        "Makes your existing integration work easier to scan against the job's platform and API responsibilities.",
      evidence: ["API integration listed in your experience", "Business workflow projects"],
      alignment: ["API integration", "Platform thinking"],
      risk: "low",
      status: "pending",
    },
    {
      id: recommendationId(workspaceKey, "impact"),
      workspace_key: workspaceKey,
      application_id: abcId,
      section: "Project detail",
      original_text: "Built automation workflows for operations teams.",
      suggested_text:
        "Built automation workflows for operations teams, partnering with stakeholders from discovery through rollout.",
      reason:
        "Surfaces the cross-functional ownership the role expects.",
      evidence: ["Operations automation work", "Stakeholder collaboration in current CV"],
      alignment: ["Discovery", "Rollout", "Stakeholder partnership"],
      risk: "low",
      status: "pending",
    },
    {
      id: recommendationId(workspaceKey, "azure"),
      workspace_key: workspaceKey,
      application_id: abcId,
      section: "Skills",
      original_text: "Skills: UiPath, APIs, process automation",
      suggested_text:
        "Skills: UiPath, APIs, process automation, scalable solution design",
      reason:
        "Reframes the skills you already demonstrate; it does not add Azure or another unsupported technology.",
      evidence: ["Architecture decisions in project descriptions"],
      alignment: ["Solution design", "Scalability"],
      risk: "medium",
      status: "rejected",
    },
    {
      id: recommendationId(workspaceKey, "orbit"),
      workspace_key: workspaceKey,
      application_id: orbitId,
      section: "Professional summary",
      original_text: "Automation professional with experience in UiPath.",
      suggested_text:
        "Automation professional who translates complex operational needs into repeatable UiPath solutions.",
      reason:
        "Leads with the outcome and systems perspective Orbit Systems is screening for.",
      evidence: ["UiPath delivery experience", "Operational process work"],
      alignment: ["Automation programs", "Repeatability"],
      risk: "low",
      status: "pending",
    },
  ];
}

export async function ensureWorkspace(workspaceKey: string) {
  const workspaces = await supabaseList<{ workspace_key: string }>(
    "career_workspaces",
    { workspace_key: `eq.${workspaceKey}` },
    "workspace_key",
    workspaceKey,
  );
  if (workspaces.length === 0) {
    await supabaseInsert("career_workspaces", {
      workspace_key: workspaceKey,
    }, workspaceKey);
  }

  const existing = await listApplications(workspaceKey);
  if (existing.length === 0) {
    await supabaseInsert(
      "career_applications",
      seedApplications(workspaceKey),
      workspaceKey,
    );
    await supabaseInsert(
      "career_recommendations",
      seedRecommendations(workspaceKey),
      workspaceKey,
    );
  }
}

export async function listApplications(workspaceKey: string) {
  const rows = await supabaseList<ApplicationRow>(
    "career_applications",
    { workspace_key: `eq.${workspaceKey}`, order: "updated_at.desc" },
    "id,job_title,company_name,location,status,match_score,cv_version,applied_date,updated_at,initials,accent,summary,strengths,gaps,score_breakdown,job_description,resume_name,accepted_count,rejected_count",
    workspaceKey,
  );
  return rows.map(toApplication);
}

export async function getApplication(workspaceKey: string, id: string) {
  const rows = await supabaseList<ApplicationRow>(
    "career_applications",
    { workspace_key: `eq.${workspaceKey}`, id: `eq.${id}` },
    "*",
    workspaceKey,
  );
  return rows[0] ? toDetail(rows[0]) : undefined;
}

export async function createApplication(
  workspaceKey: string,
  input: {
    jobTitle: string;
    companyName: string;
    location?: string | null;
    description?: string | null;
  },
) {
  const id = `app-${randomUUID()}`;
  const initials = input.companyName
    .split(/\s+/)
    .map((word) => word[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const [row] = await supabaseInsert<ApplicationRow>("career_applications", {
    id,
    workspace_key: workspaceKey,
    job_title: input.jobTitle,
    company_name: input.companyName,
    location: input.location || "Location to confirm",
    status: "saved",
    match_score: 82,
    cv_version: null,
    applied_date: null,
    initials,
    accent: "violet",
    summary:
      "Your new role workspace is ready. Once the job description and CV are processed, CareerGenie will surface strengths, gaps, and evidence-backed recommendations.",
    strengths: ["Target role captured", "CV context connected"],
    gaps: ["Analysis pending"],
    score_breakdown: {
      Skills: 82,
      Experience: 82,
      Responsibilities: 82,
      Keywords: 82,
      Education: 82,
      Certifications: 82,
    },
    job_description:
      input.description || "Job description added from the application form.",
    resume_name: "Ananya_Tiwari_Resume.pdf",
    accepted_count: 0,
    rejected_count: 0,
  }, workspaceKey);
  return row ? toApplication(row) : undefined;
}

export async function updateApplication(
  workspaceKey: string,
  id: string,
  status: Status,
) {
  const values: Record<string, unknown> = {
    status,
    updated_at: new Date().toISOString(),
  };
  if (status === "applied") values.applied_date = "Today";
  const rows = await supabaseUpdate<ApplicationRow>(
    "career_applications",
    { workspace_key: `eq.${workspaceKey}`, id: `eq.${id}` },
    values,
    workspaceKey,
  );
  return rows[0] ? toApplication(rows[0]) : undefined;
}

export async function listRecommendations(workspaceKey: string, applicationId: string) {
  const rows = await supabaseList<RecommendationRow>(
    "career_recommendations",
    {
      workspace_key: `eq.${workspaceKey}`,
      application_id: `eq.${applicationId}`,
    },
    "*",
    workspaceKey,
  );
  return rows.map(toRecommendation);
}

export async function updateRecommendation(
  workspaceKey: string,
  id: string,
  status: Recommendation["status"],
) {
  const rows = await supabaseUpdate<RecommendationRow>(
    "career_recommendations",
    { workspace_key: `eq.${workspaceKey}`, id: `eq.${id}` },
    { status },
    workspaceKey,
  );
  return rows[0] ? toRecommendation(rows[0]) : undefined;
}

export async function createInterview(
  workspaceKey: string,
  applicationId: string,
) {
  const id = `interview-${randomUUID()}`;
  const [row] = await supabaseInsert<InterviewRow>("career_interview_sessions", {
    id,
    workspace_key: workspaceKey,
    application_id: applicationId,
    question_index: 0,
    answer_count: 0,
  }, workspaceKey);
  return row?.id || id;
}

export async function getInterview(workspaceKey: string, id: string) {
  const rows = await supabaseList<InterviewRow>(
    "career_interview_sessions",
    { workspace_key: `eq.${workspaceKey}`, id: `eq.${id}` },
    "*",
    workspaceKey,
  );
  return rows[0];
}

export async function advanceInterview(
  workspaceKey: string,
  id: string,
  applicationId: string,
) {
  const current = await getInterview(workspaceKey, id);
  if (!current || current.application_id !== applicationId) return undefined;
  const rows = await supabaseUpdate<InterviewRow>(
    "career_interview_sessions",
    { workspace_key: `eq.${workspaceKey}`, id: `eq.${id}` },
    {
      question_index: current.question_index + 1,
      answer_count: current.answer_count + 1,
    },
    workspaceKey,
  );
  return rows[0];
}