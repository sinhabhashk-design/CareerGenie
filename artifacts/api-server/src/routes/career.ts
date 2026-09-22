import { Router, type IRouter, type Request, type Response } from "express";
import {
  CreateApplicationBody,
  GetApplicationParams,
  GetRecommendationsParams,
  StartInterviewParams,
  SubmitInterviewAnswerBody,
  SubmitInterviewAnswerParams,
  UpdateApplicationBody,
  UpdateApplicationParams,
  UpdateRecommendationBody,
  UpdateRecommendationParams,
} from "@workspace/api-zod";
import {
  advanceInterview,
  createApplication,
  createInterview,
  createInterviewQuestion,
  ensureWorkspace,
  getApplication,
  getInterview,
  listApplications,
  listRecommendations,
  updateApplication,
  updateRecommendation,
  type RecommendationStatus,
  type Status,
} from "../lib/normalized-career-store";
import {
  requestResumeDownload,
  requestResumeUpload,
} from "../lib/objectStorage";
import { supabaseList } from "../lib/supabase";
import { ResumeExtractionError } from "../lib/resume-extraction";

type ResumeListRow = {
  id: string;
  name: string;
  file_url: string | null;
  file_type: string | null;
  created_at: string;
  is_master: boolean;
};

const questionFor = (applicationId: string, index: number) => {
  const questions = [
    {
      category: "Technical",
      difficulty: "Medium",
      question:
        "How would you design a scalable RPA architecture for an enterprise with multiple business units?",
      preparationSignals: ["Scalability", "Exception handling", "Monitoring"],
    },
    {
      category: "Role-specific",
      difficulty: "Medium",
      question:
        "Tell me about an automation project where your first approach changed after speaking with stakeholders.",
      preparationSignals: ["Discovery", "Trade-offs", "Stakeholder partnership"],
    },
    {
      category: "CV-based",
      difficulty: "Hard",
      question:
        "Walk me through one of the API integrations on your CV. What made it reliable in production?",
      preparationSignals: ["API integration", "Reliability", "Observability"],
    },
    {
      category: "Gap-based",
      difficulty: "Medium",
      question:
        "This role touches cloud architecture. How would you approach learning a new cloud platform while keeping delivery moving?",
      preparationSignals: ["Learning plan", "Risk management", "Delivery"],
    },
  ];
  const question = questions[Math.min(index, questions.length - 1)];
  return {
    id: `${applicationId}-q-${index + 1}`,
    questionIndex: index + 1,
    totalQuestions: 10,
    ...question,
  };
};

const router: IRouter = Router();

function requireUser(req: Request, res: Response): string | null {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Authentication required." });
    return null;
  }
  return req.user.id;
}

function workspaceKey(req: Request) {
  if (!req.user) throw new Error("Authenticated user missing from request");
  return req.user.id;
}

router.use(async (req, res, next) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  try {
    res.locals.workspaceKey = userId;
    await ensureWorkspace(userId);
    next();
  } catch (error) {
    next(error);
  }
});

router.get("/dashboard", async (req, res, next) => {
  try {
    const applications = await listApplications(workspaceKey(req));
    const interviews = applications.filter((item) => item.status === "interview").length;
    const offers = applications.filter((item) => item.status === "offer").length;
    const readiness = applications.length
      ? Math.round(
          applications.reduce((total, item) => total + item.matchScore, 0) /
            applications.length,
        )
      : 0;
    res.json({
      firstName: req.user?.firstName || "there",
      applications: applications.length,
      interviews,
      offers,
      readiness,
      recentApplications: applications.slice(0, 3),
    });
  } catch (error) {
    next(error);
  }
});

router.get("/applications", async (req, res, next) => {
  try {
    res.json(await listApplications(workspaceKey(req)));
  } catch (error) {
    next(error);
  }
});

router.get("/resumes", async (req, res, next) => {
  try {
    const resumes = await supabaseList<ResumeListRow>(
      "resumes",
      { user_id: `eq.${workspaceKey(req)}`, order: "created_at.desc" },
      "id,name,file_url,file_type,created_at,is_master",
      workspaceKey(req),
    );
    res.json(
      resumes.map((resume) => ({
        id: resume.id,
        name: resume.name,
        fileUrl: resume.file_url,
        fileType: resume.file_type,
        createdAt: resume.created_at,
        isMaster: resume.is_master,
      })),
    );
  } catch (error) {
    next(error);
  }
});

router.post("/storage/uploads/request-url", async (req, res, next) => {
  try {
    const { name, size, contentType } = req.body ?? {};
    if (
      typeof name !== "string" ||
      !name.trim() ||
      typeof size !== "number" ||
      !Number.isFinite(size) ||
      size <= 0 ||
      size > 10 * 1024 * 1024 ||
      typeof contentType !== "string" ||
      !contentType.trim()
    ) {
      res.status(400).json({ error: "Missing or invalid file metadata." });
      return;
    }
    res.json(await requestResumeUpload(workspaceKey(req)));
  } catch (error) {
    next(error);
  }
});

router.get("/storage/objects/*path", async (req, res, next) => {
  try {
    const raw = req.params.path;
    const path = `/objects/${Array.isArray(raw) ? raw.join("/") : raw}`;
    const owner = workspaceKey(req);
    const matchingResume = await supabaseList<Pick<ResumeListRow, "id">>(
      "resumes",
      {
        user_id: `eq.${owner}`,
        file_url: `eq.${path}`,
        limit: "1",
      },
      "id",
      owner,
    );
    if (!matchingResume[0]) {
      res.status(404).json({ error: "Resume not found." });
      return;
    }
    const downloadUrl = await requestResumeDownload(path, owner);
    res.redirect(302, downloadUrl);
  } catch (error) {
    next(error);
  }
});

router.post("/applications", async (req, res, next) => {
  try {
    const parsed = CreateApplicationBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Job title and company are required." });
      return;
    }
    const created = await createApplication(workspaceKey(req), parsed.data);
    if (!created) {
      res.status(500).json({ error: "Unable to create this application." });
      return;
    }
    res.status(201).json(created);
  } catch (error) {
    if (error instanceof ResumeExtractionError) {
      res.status(422).json({ error: error.message, code: error.code });
      return;
    }
    next(error);
  }
});

router.get("/applications/:applicationId", async (req, res, next) => {
  try {
    const parsed = GetApplicationParams.safeParse(req.params);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid application." });
      return;
    }
    const application = await getApplication(
      workspaceKey(req),
      parsed.data.applicationId,
    );
    if (!application) {
      res.status(404).json({ error: "Application not found." });
      return;
    }
    res.json(application);
  } catch (error) {
    next(error);
  }
});

router.patch("/applications/:applicationId", async (req, res, next) => {
  try {
    const params = UpdateApplicationParams.safeParse(req.params);
    const body = UpdateApplicationBody.safeParse(req.body);
    if (!params.success || !body.success || !body.data.status) {
      res.status(400).json({ error: "Unable to update this application." });
      return;
    }
    const application = await updateApplication(
      workspaceKey(req),
      params.data.applicationId,
      body.data.status as Status,
    );
    if (!application) {
      res.status(404).json({ error: "Application not found." });
      return;
    }
    res.json(application);
  } catch (error) {
    next(error);
  }
});

router.get(
  "/applications/:applicationId/recommendations",
  async (req, res, next) => {
    try {
      const parsed = GetRecommendationsParams.safeParse(req.params);
      if (!parsed.success) {
        res.status(400).json({ error: "Invalid application." });
        return;
      }
      res.json(
        await listRecommendations(
          workspaceKey(req),
          parsed.data.applicationId,
        ),
      );
    } catch (error) {
      next(error);
    }
  },
);

router.patch("/recommendations/:recommendationId", async (req, res, next) => {
  try {
    const params = UpdateRecommendationParams.safeParse(req.params);
    const body = UpdateRecommendationBody.safeParse(req.body);
    if (!params.success || !body.success || !body.data.status) {
      res.status(400).json({ error: "Unable to update this recommendation." });
      return;
    }
    const recommendation = await updateRecommendation(
      workspaceKey(req),
      params.data.recommendationId,
      body.data.status as RecommendationStatus,
    );
    if (!recommendation) {
      res.status(404).json({ error: "Recommendation not found." });
      return;
    }
    res.json(recommendation);
  } catch (error) {
    next(error);
  }
});

router.post("/applications/:applicationId/interview", async (req, res, next) => {
  try {
    const parsed = StartInterviewParams.safeParse(req.params);
    if (!parsed.success) {
      res.status(404).json({ error: "Application not found." });
      return;
    }
    const application = await getApplication(
      workspaceKey(req),
      parsed.data.applicationId,
    );
    if (!application) {
      res.status(404).json({ error: "Application not found." });
      return;
    }
    const id = await createInterview(
      workspaceKey(req),
      parsed.data.applicationId,
    );
    if (!id) {
      res.status(404).json({ error: "Application not found." });
      return;
    }
    const firstQuestion = questionFor(parsed.data.applicationId, 0);
    await createInterviewQuestion(workspaceKey(req), id, firstQuestion);
    res.status(201).json({ ...firstQuestion, id });
  } catch (error) {
    next(error);
  }
});

router.post("/interviews/:interviewId/answer", async (req, res, next) => {
  try {
    const params = SubmitInterviewAnswerParams.safeParse(req.params);
    const body = SubmitInterviewAnswerBody.safeParse(req.body);
    if (!params.success || !body.success) {
      res.status(400).json({ error: "Please add an answer before continuing." });
      return;
    }
    const key = workspaceKey(req);
    const session = await getInterview(key, params.data.interviewId);
    if (!session) {
      res.status(400).json({ error: "Please start an interview before answering." });
      return;
    }
    const score = Math.min(96, 74 + Math.min(body.data.answer.length / 20, 18));
    const strengths = ["You connected your answer to a practical delivery outcome."];
    const improvements = ["Add one concrete example of monitoring or exception handling."];
    const updated = await advanceInterview(
      key,
      params.data.interviewId,
      session.application_id,
      body.data.answer,
      Math.round(score),
      strengths,
      improvements,
    );
    if (!updated) {
      res.status(400).json({ error: "This interview session is no longer available." });
      return;
    }
    const nextQuestion = questionFor(session.application_id, updated.question_index);
    await createInterviewQuestion(key, params.data.interviewId, nextQuestion);
    res.json({
      score: Math.round(score),
      strengths,
      improvements,
      nextQuestion,
    });
  } catch (error) {
    next(error);
  }
});

export default router;