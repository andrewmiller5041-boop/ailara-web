// Server-only tool definitions for the coach. The browser never supplies tools.

export const AILARA_TOOLS = [
    {
      name: "log_workout",
      description: "Logs a completed workout or physical activity to the user's Progress tab. Use this when the user says they completed, finished, or did any workout, exercise, walk, run, yoga session, or physical activity.",
      input_schema: {
        type: "object",
        properties: {
          type: { type: "string", description: "Workout type: Strength, HIIT, Cardio, Yoga, Pilates, Run, Walk, Cycling, Swimming, Sports, or Other" },
          duration_minutes: { type: "integer", description: "Duration in minutes" },
          feel: { type: "string", enum: ["1","2","3","4","5"], description: "How the user felt: 1=exhausted, 3=ok, 5=great" },
          creator: { type: "string", description: "Content creator or class name if they did a video workout (e.g. Caroline Girvan, Yoga With Adriene)" },
          video_title: { type: "string", description: "Specific video or workout name if mentioned" },
          notes: { type: "string", description: "Any notes about the workout — exercises, PRs, how they felt" }
        },
        required: ["type", "duration_minutes"]
      }
    },
    {
      name: "log_weight",
      description: "Logs a body weight measurement to the user's Progress tab. Use when the user mentions their current weight, weighed themselves, or shares a weight reading.",
      input_schema: {
        type: "object",
        properties: {
          weight_lbs: { type: "number", description: "Weight in pounds" },
          notes: { type: "string", description: "Any notes (e.g. morning weight, post-workout)" }
        },
        required: ["weight_lbs"]
      }
    },
    {
      name: "log_habit",
      description: "Marks a daily habit as completed in the Progress tab. Use when the user says they drank water, hit protein, slept well, took supplements, etc.",
      input_schema: {
        type: "object",
        properties: {
          habits: {
            type: "array",
            items: { type: "string", enum: ["workout","water","protein","sleep","supplements"] },
            description: "Which habits to mark as done today"
          }
        },
        required: ["habits"]
      }
    },
    {
      name: "check_supplement",
      description: "Looks up a supplement or herb from the user's stack and returns its research summary and any TCM/drug interaction notes. Use when the user asks about a supplement they're taking.",
      input_schema: {
        type: "object",
        properties: {
          supplement_name: { type: "string", description: "Name of the supplement or herb" }
        },
        required: ["supplement_name"]
      }
    },
    {
      name: "analyze_image",
      description: "Analyzes an image the user has uploaded. Can identify: meal/food for nutrition estimate, supplement label for ingredient check, or workout form/posture for feedback. ONLY use when an image is actually present in the conversation.",
      input_schema: {
        type: "object",
        properties: {
          analysis_type: {
            type: "string",
            enum: ["meal_nutrition", "supplement_label", "body_composition", "workout_form", "general"],
            description: "What to analyze in the image"
          },
          context: { type: "string", description: "What the user wants to know about the image" }
        },
        required: ["analysis_type"]
      }
    },
    {
      name: "update_profile",
      description: "Updates a field in the user's health profile when they share new information about themselves — new weight, changed goal, dietary change, new condition, etc.",
      input_schema: {
        type: "object",
        properties: {
          field: { type: "string", description: "Profile field to update: weight, goals, diet, conditions, activityLevel, workoutDays, etc." },
          value: { type: "string", description: "New value for the field" }
        },
        required: ["field", "value"]
      }
    },
    {
      name: "suggest_workout",
      description: "Generates a personalized workout recommendation and optionally logs it as a planned session. Use when the user asks what they should do today, needs a workout plan, or wants exercise suggestions.",
      input_schema: {
        type: "object",
        properties: {
          focus: { type: "string", description: "Muscle group or workout focus: Full Body, Upper, Lower, Core, Cardio, etc." },
          duration_minutes: { type: "integer", description: "Target duration" },
          equipment: { type: "string", description: "Available equipment" },
          creator_recommendation: { type: "string", description: "Specific in-app creator to recommend (e.g. Caroline Girvan for strength)" }
        },
        required: ["focus"]
      }
    },
    {
      name: "search_workouts",
      description: "Searches the app's video library of 1,800+ videos to find specific workout recommendations. Use this EVERY TIME a user asks for a workout, video recommendation, or exercise suggestion. Call this BEFORE responding so you can name specific videos and creators. Returns matching videos with titles, creators, series, duration, and direct links.",
      input_schema: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Natural language search query. Examples: 'beginner pilates', '30 minute HIIT no equipment', 'yoga for back pain', 'tabata cardio', 'strength upper body dumbbells', 'low impact senior', 'mobility morning routine'"
          },
          type: { type: "string", description: "Filter by workout type: Strength, HIIT, Cardio, Yoga, Pilates, Core/Abs, Low-Impact, Technique, Education, etc." },
          level: { type: "string", description: "Filter by level: Beginner, Intermediate, Advanced, All Levels" },
          creator: { type: "string", description: "Filter by specific creator name (partial match ok)" },
          maxResults: { type: "integer", description: "Max results to return (default 8, max 15)" }
        },
        required: ["query"]
      }
    },
    {
      name: "search_recipes",
      description: "Searches the app's library of 519 recipes to find specific meal recommendations. Use this EVERY TIME a user asks for meal ideas, food recommendations, what to eat, or recipe suggestions. Call BEFORE responding so you can name specific recipes. Returns recipe name, meal type, macros, dietary tags, prep time, and category.",
      input_schema: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Natural language search. Examples: 'high protein breakfast', 'vegan dinner', 'quick lunch under 20 minutes', 'gluten free snack', 'post workout meal', 'chicken recipes', 'low carb dinner', 'mass builder breakfast'"
          },
          mealType:   { type: "string", description: "Filter by: Breakfast, Lunch, Dinner, or Snack" },
          dietary:    { type: "string", description: "Filter by dietary tag: GF (gluten-free), DF (dairy-free), NF (nut-free), SF (soy-free)" },
          minProtein: { type: "integer", description: "Minimum grams of protein (from macros field)" },
          maxTime:    { type: "integer", description: "Maximum prep time in minutes" },
          maxResults: { type: "integer", description: "Max results to return (default 6, max 12)" }
        },
        required: ["query"]
      }
    },
    {
      name: "get_workout_creators",
      description: "Returns all available workout creators organized by category. Use when a user asks what creators are available, what categories exist, or wants to browse options by type.",
      input_schema: {
        type: "object",
        properties: {
          category: { type: "string", description: "Optional: filter by category tag (Strength, HIIT, Yoga, Pilates, Cardio, Foundations, etc.)" }
        }
      }
    }
];
