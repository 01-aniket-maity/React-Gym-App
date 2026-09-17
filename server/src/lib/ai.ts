import OpenAI from "openai";
import dotenv from "dotenv";
import { TrainingPlan, UserProfile } from "../../types";

dotenv.config();

export async function generateTrainingPlan(
  profile: UserProfile | Record<string, any>
): Promise<
  Omit<TrainingPlan, "id" | "userId" | "version" | "createdAt">
> {
  // Normalize profile data
  const normalizedProfile: UserProfile = {
    goal: profile.goal || "bulk",
    experience: profile.experience || "intermediate",
    days_per_week: profile.days_per_week || 4,
    session_length: profile.session_length || 60,
    equipment: profile.equipment || "full_gym",
    injuries: profile.injuries || null,
    preferred_split: profile.preferred_split || "upper_lower",
  };

  const apiKey = process.env.OPEN_ROUTER_KEY;

  if (!apiKey) {
    throw new Error("OPEN_ROUTER_KEY is not set in environment variables");
  }

  const openai = new OpenAI({
    apiKey,
    baseURL: "https://openrouter.ai/api/v1",
    defaultHeaders: {
      "HTTP-Referer":
        process.env.BASE_URL || "http://localhost:3001",
      "X-Title": "GymAI Plan Generator",
    },
  });

  const prompt = buildPrompt(normalizedProfile);

  const models = [
    "nex-agi/nex-n2.5-mini:free",
    "liquid/lfm-2.5-2.6b:free",
    "nvidia/nemotron-3-super-120b-a12b:free",
    "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free",
  ];

  let lastError: any = null;

  for (const model of models) {
    try {
      console.log("==========================================");
      console.log(`[AI] Trying model: ${model}`);
      console.log("==========================================");

      const aiStart = Date.now();

      const completion = await openai.chat.completions.create({
        model,

        messages: [
          {
            role: "system",
            content: `
You are an expert fitness trainer and workout program designer.

Your job is to generate a personalized workout plan.

IMPORTANT:
You MUST return ONLY valid JSON.

You MUST follow the provided JSON schema EXACTLY.

DO NOT:
- use Markdown
- use \`\`\`json
- use \`\`\`
- add explanations before or after the JSON
- create your own field names
- use "workout_plan"
- use "sessions"
- use "progressive_overload_notes"
- weeklySchedule must contain EXACTLY the requested number of WORKOUT days.
- Do NOT include rest days in weeklySchedule.

The top-level JSON object MUST contain exactly:
1. overview
2. weeklySchedule
3. progression

The field names are case-sensitive.
`,
          },
          {
            role: "user",
            content: prompt,
          },
        ],

        temperature: 0.2,

        response_format: {
          type: "json_schema",

          json_schema: {
            name: "training_plan",

            strict: true,

            schema: {
              type: "object",

              properties: {
                overview: {
                  type: "object",

                  properties: {
                    goal: {
                      type: "string",
                    },

                    frequency: {
                      type: "string",
                    },

                    split: {
                      type: "string",
                    },

                    notes: {
                      type: "string",
                    },
                  },

                  required: [
                    "goal",
                    "frequency",
                    "split",
                    "notes",
                  ],

                  additionalProperties: false,
                },

                weeklySchedule: {
                  type: "array",

                  items: {
                    type: "object",

                    properties: {
                      day: {
                        type: "string",
                      },

                      focus: {
                        type: "string",
                      },

                      exercises: {
                        type: "array",

                        items: {
                          type: "object",

                          properties: {
                            name: {
                              type: "string",
                            },

                            sets: {
                              type: "integer",
                            },

                            reps: {
                              type: "string",
                            },

                            rest: {
                              type: "string",
                            },

                            rpe: {
                              type: "number",
                            },

                            notes: {
                              type: "string",
                            },

                            alternatives: {
                              type: "array",

                              items: {
                                type: "string",
                              },
                            },
                          },

                          required: [
                            "name",
                            "sets",
                            "reps",
                            "rest",
                            "rpe",
                            "notes",
                            "alternatives",
                          ],

                          additionalProperties: false,
                        },
                      },
                    },

                    required: [
                      "day",
                      "focus",
                      "exercises",
                    ],

                    additionalProperties: false,
                  },
                },

                progression: {
                  type: "string",
                },
              },

              required: [
                "overview",
                "weeklySchedule",
                "progression",
              ],

              additionalProperties: false,
            },
          },
        },
      });

      console.log(
        `[AI] ${model} response time: ${
          Date.now() - aiStart
        } ms`
      );

      console.log("[AI] Model used:", completion.model);

      const content =
        completion.choices[0]?.message?.content;

      console.log("[AI] RAW CONTENT:");
      console.log(content);

      if (!content) {
        throw new Error("No content in AI response");
      }

      const cleanedContent = content
        .replace(/^```json\s*/i, "")
        .replace(/^```\s*/i, "")
        .replace(/\s*```$/i, "")
        .trim();

      console.log("[AI] CLEANED JSON:");
      console.log(cleanedContent);

      let planData: any;

      try {
        planData = JSON.parse(cleanedContent);
      } catch (parseError) {
        console.error(
          "[AI] Failed to parse JSON:",
          cleanedContent
        );

        throw new Error("AI returned invalid JSON");
      }

      console.log("===== PARSED AI RESPONSE =====");
      console.dir(planData, { depth: null });

      if (
        !planData ||
        typeof planData !== "object" ||
        !planData.overview ||
        !Array.isArray(planData.weeklySchedule) ||
        typeof planData.progression !== "string"
      ) {
        console.error(
          "[AI] Invalid training plan structure:",
          JSON.stringify(planData, null, 2)
        );

        throw new Error(
          "AI returned an invalid training plan structure"
        );
      }

      if (
        planData.weeklySchedule.length !==
        normalizedProfile.days_per_week
      ) {
        console.error(
          `[AI] Expected ${normalizedProfile.days_per_week} workout days but received ${planData.weeklySchedule.length}`
        );

        throw new Error(
          "AI returned an incorrect number of workout days"
        );
      }

      console.log(
        `✅ [AI] Successfully generated plan using ${model}`
      );

      return formatPlanResponse(
        planData,
        normalizedProfile
      );
    } catch (error: any) {
      lastError = error;

      console.error(
        `❌ [AI] Model failed: ${model}`
      );

      console.error(
        "[AI] Status:",
        error?.status || "unknown"
      );

      console.error(
        "[AI] Error:",
        error?.message || error
      );

      console.log(
        "[AI] Trying next fallback model..."
      );
    }
  }

  console.error(
    "❌ [AI] All fallback models failed."
  );

  throw new Error(
    `All AI models failed. Last error: ${
      lastError?.message || "Unknown error"
    }`
  );
}


// ======================================================
// FORMAT AI RESPONSE
// ======================================================

function formatPlanResponse(
  aiResponse: any,
  profile: UserProfile
): Omit<
  TrainingPlan,
  "id" | "userId" | "version" | "createdAt"
> {
  const plan = {
    overview: {
      goal:
        aiResponse.overview.goal ||
        `Customized ${profile.goal} program`,

      frequency:
        aiResponse.overview.frequency ||
        `${profile.days_per_week} days per week`,

      split:
        aiResponse.overview.split ||
        profile.preferred_split,

      notes:
        aiResponse.overview.notes ||
        "Follow the program consistently for best results.",
    },

    weeklySchedule: aiResponse.weeklySchedule.map(
      (day: any) => ({
        day: day.day || "Day",

        focus:
          day.focus ||
          "Full Body",

        exercises: (day.exercises || []).map(
          (ex: any) => ({
            name:
              ex.name ||
              "Exercise",

            sets:
              ex.sets ||
              3,

            reps:
              ex.reps ||
              "8-12",

            rest:
              ex.rest ||
              "60-90 sec",

            rpe:
              ex.rpe ||
              7,

            notes:
              ex.notes ||
              "",

            alternatives:
              Array.isArray(ex.alternatives)
                ? ex.alternatives
                : [],
          })
        ),
      })
    ),

    progression:
      aiResponse.progression ||
      "Increase weight gradually when you can complete all sets with good form. Track your progress weekly.",
  };

  return plan;
}


// ======================================================
// BUILD PROMPT
// ======================================================

function buildPrompt(
  profile: UserProfile
): string {
  const goalMap: Record<string, string> = {
    bulk: "build muscle and gain size",

    cut: "lose fat and maintain muscle",

    recomp:
      "simultaneously lose fat and build muscle",

    strength:
      "build maximum strength",

    endurance:
      "improve cardiovascular endurance and stamina",
  };

  const experienceMap: Record<string, string> = {
    beginner:
      "beginner (0-1 years of training experience)",

    intermediate:
      "intermediate (1-3 years of training experience)",

    advanced:
      "advanced (3+ years of training experience)",
  };

  const equipmentMap: Record<string, string> = {
    full_gym:
      "full gym access with all equipment",

    home:
      "home gym with limited equipment",

    dumbbells:
      "only dumbbells available",
  };

  const splitMap: Record<string, string> = {
    full_body:
      "full body workouts",

    upper_lower:
      "upper/lower split",

    ppl:
      "push/pull/legs split",

    custom:
      "the best split for the user's goals",
  };

  return `
Create a personalized workout plan.

USER PROFILE
=============

Goal:
${goalMap[profile.goal] || profile.goal}

Experience:
${experienceMap[profile.experience] || profile.experience}

Days per week:
${profile.days_per_week}

Session length:
${profile.session_length} minutes

Equipment:
${equipmentMap[profile.equipment] || profile.equipment}

Preferred split:
${splitMap[profile.preferred_split] || profile.preferred_split}

${
  profile.injuries
    ? `Injuries or limitations:
${profile.injuries}`
    : "No injuries or limitations specified."
}


REQUIREMENTS
============

1. Create EXACTLY ${
    profile.days_per_week
  } workout days.

2. Each workout must fit within ${
    profile.session_length
  } minutes.

3. Include 4-6 exercises per workout.

4. RPE should generally be between 6 and 9.

5. Choose exercises appropriate for the user's experience level.

6. Match the preferred workout split.

7. ${
    profile.injuries
      ? `Avoid exercises that could aggravate: ${profile.injuries}`
      : "Choose safe and practical exercises."
  }

8. Provide alternatives where appropriate.

9. Include short and useful form/technique notes.

10. Include a clear progression strategy.

11. Keep the workout practical and realistic.

12. Do NOT add unnecessary information.

13. The response MUST match the provided JSON schema EXACTLY.


IMPORTANT JSON STRUCTURE
========================

The response MUST have this exact structure:

{
  "overview": {
    "goal": "...",
    "frequency": "...",
    "split": "...",
    "notes": "..."
  },

  "weeklySchedule": [
    {
      "day": "...",
      "focus": "...",
      "exercises": [
        {
          "name": "...",
          "sets": 3,
          "reps": "8-12",
          "rest": "60-90 sec",
          "rpe": 7,
          "notes": "...",
          "alternatives": ["...", "..."]
        }
      ]
    }
  ],

  "progression": "..."
}

DO NOT use these names:

"workout_plan"
"experience_level"
"sessions_per_week"
"sessions"
"progressive_overload_notes"

Use ONLY:

"overview"
"weeklySchedule"
"progression"

Return ONLY the JSON object.
`;
}

