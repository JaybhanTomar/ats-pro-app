const functions = require('firebase-functions');
const admin = require('firebase-admin');
const stripe = require('stripe')(functions.config().stripe.secret_key);

admin.initializeApp();

// Subscription plans
const PLANS = {
  FREE: {
    name: 'Free',
    limits: {
      analyses: 5,
      coverLetters: 3,
      optimizations: 2
    }
  },
  PREMIUM: {
    name: 'Premium',
    limits: {
      analyses: -1, // unlimited
      coverLetters: -1,
      optimizations: -1
    }
  }
};
    price: 9.99
  }
};

// Whitelist of allowed users (for beta access)
const allowedUsers = ['your@email.com']; // Replace with actual emails

// Gemini API key from environment
const GEMINI_API_KEY = functions.config().gemini.api_key || process.env.GEMINI_API_KEY;

// Helper function to get user subscription
async function getUserSubscription(uid) {
  const userDoc = await admin.firestore().collection('users').doc(uid).get();
  if (!userDoc.exists) {
    return { plan: 'FREE', stripeCustomerId: null, subscriptionStatus: null };
  }
  return userDoc.data();
}

// Helper function to check usage limits
async function checkUsageLimit(uid, action) {
  const user = await getUserSubscription(uid);
  const plan = PLANS[user.plan] || PLANS.FREE;
  
  // Premium users have unlimited usage
  if (plan[`${action}PerMonth`] === -1) {
    return { allowed: true, remaining: 'unlimited' };
  }
  
  // Get current month usage
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  
  const usageQuery = await admin.firestore()
    .collection('usage')
    .where('userId', '==', uid)
    .where('action', '==', action)
    .where('timestamp', '>=', startOfMonth)
    .get();
  
  const used = usageQuery.size;
  const limit = plan[`${action}PerMonth`];
  const remaining = Math.max(0, limit - used);
  
  return { 
    allowed: used < limit, 
    remaining, 
    used, 
    limit 
  };
}

// Helper function to record usage
async function recordUsage(uid, action) {
  await admin.firestore().collection('usage').add({
    userId: uid,
    action,
    timestamp: admin.firestore.FieldValue.serverTimestamp()
  });
}

exports.analyzeResume = functions.https.onCall(async (data, context) => {
  // Check if user is authenticated
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated.');
  }

  const uid = context.auth.uid;

  // Check if user email is in whitelist (beta access)
  const userEmail = context.auth.token.email;
  if (!allowedUsers.includes(userEmail)) {
    throw new functions.https.HttpsError('permission-denied', 'Access denied. This service is in beta. Contact support for access.');
  }

  // Check usage limits
  const usageCheck = await checkUsageLimit(uid, 'analyses');
  if (!usageCheck.allowed) {
    throw new functions.https.HttpsError('resource-exhausted', 
      `Monthly analysis limit reached. ${usageCheck.used}/${usageCheck.limit} used. Upgrade to Premium for unlimited access.`,
      { upgradeRequired: true, used: usageCheck.used, limit: usageCheck.limit }
    );
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

    const result = JSON.parse(cleanJson);
    
    // Record usage
    await recordUsage(uid, 'analyses');
    
    return result;
  } catch (error) {
    throw new functions.https.HttpsError('internal', error.message);
  }
});

// Similar functions for coverLetter and optimizeResume
exports.generateCoverLetter = functions.https.onCall(async (data, context) => {
  // Check if user is authenticated
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated.');
  }

  const uid = context.auth.uid;

  // Check if user email is in whitelist (beta access)
  const userEmail = context.auth.token.email;
  if (!allowedUsers.includes(userEmail)) {
    throw new functions.https.HttpsError('permission-denied', 'Access denied. This service is in beta. Contact support for access.');
  }

  // Check usage limits
  const usageCheck = await checkUsageLimit(uid, 'coverLetters');
  if (!usageCheck.allowed) {
    throw new functions.https.HttpsError('resource-exhausted', 
      `Monthly cover letter limit reached. ${usageCheck.used}/${usageCheck.limit} used. Upgrade to Premium for unlimited access.`,
      { upgradeRequired: true, used: usageCheck.used, limit: usageCheck.limit }
    );
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

    // Record usage
    await recordUsage(uid, 'coverLetters');

    return letter;
  } catch (error) {
    throw new functions.https.HttpsError('internal', error.message);
  }
});

exports.optimizeResume = functions.https.onCall(async (data, context) => {
  // Check if user is authenticated
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated.');
  }

  const uid = context.auth.uid;

  // Check if user email is in whitelist (beta access)
  const userEmail = context.auth.token.email;
  if (!allowedUsers.includes(userEmail)) {
    throw new functions.https.HttpsError('permission-denied', 'Access denied. This service is in beta. Contact support for access.');
  }

  // Check usage limits
  const usageCheck = await checkUsageLimit(uid, 'optimizations');
  if (!usageCheck.allowed) {
    throw new functions.https.HttpsError('resource-exhausted', 
      `Monthly optimization limit reached. ${usageCheck.used}/${usageCheck.limit} used. Upgrade to Premium for unlimited access.`,
      { upgradeRequired: true, used: usageCheck.used, limit: usageCheck.limit }
    );
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
      
      // Record usage
      await recordUsage(uid, 'optimizations');
      
      return optimizedText;
    } else {
      throw new Error("Could not generate text.");
    }
  } catch (error) {
    throw new functions.https.HttpsError('internal', error.message);
  }
});

// Get subscription and usage data
exports.getSubscription = functions.https.onCall(async (data, context) => {
  // Check if user is authenticated
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated.');
  }

  const uid = context.auth.uid;

  try {
    // Get user's subscription from Firestore
    const userDoc = await admin.firestore().collection('users').doc(uid).get();
    const userData = userDoc.data() || {};
    
    // Default to free plan if no subscription
    const subscription = userData.subscription || 'FREE';
    
    // Get current month's usage
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
    
    const usageQuery = await admin.firestore()
      .collection('usage')
      .where('userId', '==', uid)
      .where('timestamp', '>=', startOfMonth)
      .where('timestamp', '<=', endOfMonth)
      .get();
    
    const usage = {
      analyses: 0,
      coverLetters: 0,
      optimizations: 0
    };
    
    usageQuery.forEach(doc => {
      const data = doc.data();
      if (usage.hasOwnProperty(data.type)) {
        usage[data.type]++;
      }
    });
    
    return {
      subscription,
      usage,
      limits: PLANS[subscription].limits
    };
  } catch (error) {
    throw new functions.https.HttpsError('internal', error.message);
  }
});