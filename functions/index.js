const functions = require('firebase-functions');
const admin = require('firebase-admin');

admin.initializeApp();

// Whitelist of allowed user emails
const allowedUsers = ['your@email.com']; // Replace with actual emails

// Gemini API key from environment
const GEMINI_API_KEY = functions.config().gemini.api_key || process.env.GEMINI_API_KEY;

exports.analyzeResume = functions.https.onCall(async (data, context) => {
  // Check if user is authenticated
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated.');
  }

  // Check if user email is in whitelist
  const userEmail = context.auth.token.email;
  if (!allowedUsers.includes(userEmail)) {
    throw new functions.https.HttpsError('permission-denied', 'Access denied. User not authorized.');
  }

  const { resumeText, jobDescription, mode, fileData, mimeType } = data;

  if (!resumeText && !fileData) {
    throw new functions.https.HttpsError('invalid-argument', 'Resume text or file data is required.');
  }

  // Construct system prompt
  const systemPrompt = mode === "MATCH"
    ? "You are a strict, deterministic Applicant Tracking System (ATS) algorithm. Your task is to evaluate the resume against the job description with zero creativity. Be extremely critical and objective. If keywords from the JD are missing, penalize the score. If formatting is poor, penalize the score. Your output must be consistent. Return JSON matching the schema."
    : "You are a strict Resume Coach. Critique this resume against general industry standards. Be critical. Return JSON matching the schema.";

  const RESPONSE_SCHEMA = {
    type: "OBJECT",
    properties: {
      score: { type: "STRING", description: "Score in fraction format (e.g., 85/100)" },
      matchPercentage: { type: "NUMBER", description: "Numeric percentage (0-100)" },
      summary: { type: "STRING", description: "Professional summary of alignment." },
      keywordsFound: { type: "ARRAY", items: { type: "STRING" } },
      keywordsMissing: { type: "ARRAY", items: { type: "STRING" } },
      actionableFeedback: { type: "ARRAY", items: { type: "STRING" } }
    },
    required: ["score", "matchPercentage", "summary", "keywordsFound", "keywordsMissing", "actionableFeedback"],
  };

  let promptText = mode === "MATCH" ? `ANALYZE MATCH:\n\nJOB DESCRIPTION:\n${jobDescription}\n\n` : `ANALYZE RESUME CRITIQUE:\n\n`;

  const contentParts = [];

  if (fileData) {
    promptText += "RESUME FILE (See attached PDF):";
    contentParts.push({ text: promptText });
    contentParts.push({
      inlineData: {
        mimeType: mimeType,
        data: fileData
      }
    });
  } else {
    promptText += `RESUME TEXT:\n${resumeText}`;
    contentParts.push({ text: promptText });
  }

  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${GEMINI_API_KEY}`;

  const payload = {
    contents: [{ parts: contentParts }],
    tools: !fileData ? [{ "google_search": {} }] : undefined,
    systemInstruction: { parts: [{ text: systemPrompt }] },
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: RESPONSE_SCHEMA,
      temperature: 0.0,
    }
  };

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();

    if (data.error) throw new Error(data.error.message);

    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) throw new Error("No analysis returned.");

    let cleanJson = rawText;
    const firstBrace = rawText.indexOf('{');
    const lastBrace = rawText.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1) {
      cleanJson = rawText.substring(firstBrace, lastBrace + 1);
    }

    return JSON.parse(cleanJson);
  } catch (error) {
    throw new functions.https.HttpsError('internal', error.message);
  }
});

// Similar functions for coverLetter and optimizeResume
exports.generateCoverLetter = functions.https.onCall(async (data, context) => {
  // Similar auth and whitelist checks
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated.');
  }
  const userEmail = context.auth.token.email;
  if (!allowedUsers.includes(userEmail)) {
    throw new functions.https.HttpsError('permission-denied', 'Access denied.');
  }

  const { resumeText, jobDescription, fileData, mimeType } = data;

  const systemPrompt = "You are a professional career writer. Write a concise, compelling cover letter (300 words max) connecting the candidate's specific resume achievements to the job description's requirements. Use a formal but modern tone.";

  let promptText = `GENERATE COVER LETTER:\n\nJOB DESCRIPTION:\n${jobDescription}\n\n`;
  const contentParts = [];

  if (fileData) {
    promptText += "RESUME FILE (See attached PDF):";
    contentParts.push({ text: promptText });
    contentParts.push({
      inlineData: {
        mimeType: mimeType,
        data: fileData
      }
    });
  } else {
    promptText += `RESUME TEXT:\n${resumeText}`;
    contentParts.push({ text: promptText });
  }

  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${GEMINI_API_KEY}`;

  const payload = {
    contents: [{ parts: contentParts }],
    tools: !fileData ? [{ "google_search": {} }] : undefined,
    systemInstruction: { parts: [{ text: systemPrompt }] },
    generationConfig: {
      temperature: 0.7
    }
  };

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();

    if (data.error) throw new Error(data.error.message);

    const letter = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!letter) throw new Error("Could not generate text.");

    return letter;
  } catch (error) {
    throw new functions.https.HttpsError('internal', error.message);
  }
});

exports.optimizeResume = functions.https.onCall(async (data, context) => {
  // Similar auth checks
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated.');
  }
  const userEmail = context.auth.token.email;
  if (!allowedUsers.includes(userEmail)) {
    throw new functions.https.HttpsError('permission-denied', 'Access denied.');
  }

  const { resumeText, jobDescription, fileData, mimeType } = data;

  const systemPrompt = "You are an expert Executive Resume Writer and LaTeX developer. Your task is to rewrite the candidate's resume content to maximize their ATS score for the provided Job Description and output it as a complete, compilable LaTeX document. \n" +
    "1. PRESERVE STRUCTURE: Keep the original resume's sections (Header, Summary, Experience, Education, Skills). \n" +
    "2. INTEGRATE KEYWORDS: Naturally weave in critical hard skills and keywords from the JD into the Summary and Experience sections. \n" +
    "3. ENHANCE IMPACT: Rewrite bullet points to use strong action verbs and emphasize results/impact. \n" +
    "4. COMPACT ATS LAYOUT: Use `\\documentclass[10pt,letterpaper]{article}`. Include `\\usepackage[left=0.6in,top=0.6in,right=0.6in,bottom=0.6in]{geometry}` to maximize space. Use `\\usepackage{enumitem}` and `\\setlist{nosep}` to remove gaps between bullets. Use `\\titlespacing` to reduce header space. NO TABLES. \n" +
    "5. OUTPUT: Provide ONLY the raw LaTeX code starting with \\documentclass and ending with \\end{document}. Do not wrap it in markdown code blocks.";

  let promptText = `GENERATE COMPACT LATEX RESUME OPTIMIZED FOR JD:\n\nJOB DESCRIPTION:\n${jobDescription}\n\n`;
  const contentParts = [];

  if (fileData) {
    promptText += "RESUME FILE (See attached PDF):";
    contentParts.push({ text: promptText });
    contentParts.push({
      inlineData: {
        mimeType: mimeType,
        data: fileData
      }
    });
  } else {
    promptText += `RESUME TEXT:\n${resumeText}`;
    contentParts.push({ text: promptText });
  }

  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${GEMINI_API_KEY}`;

  const payload = {
    contents: [{ parts: contentParts }],
    tools: !fileData ? [{ "google_search": {} }] : undefined,
    systemInstruction: { parts: [{ text: systemPrompt }] },
    generationConfig: {
      temperature: 0.4
    }
  };

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();

    if (data.error) throw new Error(data.error.message);

    let optimizedText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (optimizedText) {
      optimizedText = optimizedText.replace(/```latex|```/g, '').trim();
      return optimizedText;
    } else {
      throw new Error("Could not generate text.");
    }
  } catch (error) {
    throw new functions.https.HttpsError('internal', error.message);
  }
});