const fetch = require('node-fetch');

export default async function handler(req, res) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Check for authentication (you can implement this with Vercel KV or similar)
    // For now, we'll skip auth checks and focus on getting it working

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'API key missing' });
    }

    const { resumeText, jobDescription, mode, fileData, mimeType } = req.body;

    if (!resumeText && !fileData) {
      return res.status(400).json({ error: 'Resume text or file required' });
    }

    if (!jobDescription) {
      return res.status(400).json({ error: 'Job description required' });
    }

    // Build the prompt based on mode
    let systemPrompt = '';
    if (mode === 'CRITIQUE') {
      systemPrompt = 'You are an expert ATS resume reviewer. Analyze this resume for ATS compatibility and provide actionable feedback. Focus on keyword optimization, formatting, and ATS best practices.';
    } else {
      systemPrompt = 'You are an expert ATS resume analyzer. Compare this resume against the job description and provide a detailed match analysis including score, keywords found/missing, and improvement suggestions.';
    }

    let promptText = `JOB DESCRIPTION:\n${jobDescription}\n\n`;
    const contentParts = [];

    if (fileData) {
      promptText += 'RESUME FILE (analyze the content):';
      contentParts.push({ text: promptText });
      contentParts.push({
        inlineData: {
          mimeType: mimeType || 'application/pdf',
          data: fileData
        }
      });
    } else {
      promptText += `RESUME TEXT:\n${resumeText}`;
      contentParts.push({ text: promptText });
    }

    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`;

    const payload = {
      contents: [{ parts: contentParts }],
      tools: !fileData ? [{ "google_search": {} }] : undefined,
      systemInstruction: { parts: [{ text: systemPrompt }] },
      generationConfig: {
        temperature: 0.3
      }
    };

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();

    if (data.error) {
      throw new Error(data.error.message);
    }

    const analysis = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!analysis) {
      throw new Error('Could not generate analysis');
    }

    // Parse the response to extract structured data
    // This is a simplified version - you might want to improve the parsing
    const result = {
      score: analysis.match(/(\d+\/\d+)/)?.[0] || '75/100',
      matchPercentage: parseInt(analysis.match(/(\d+)%/)?.[1] || '75'),
      summary: analysis.split('\n')[0] || 'Analysis completed',
      keywordsFound: analysis.match(/Keywords found:?\s*([^]*?)(?=Keywords missing|$)/i)?.[1]?.split(',').map(k => k.trim()).filter(k => k) || [],
      keywordsMissing: analysis.match(/Keywords missing:?\s*([^]*?)(?=Actionable|$)/i)?.[1]?.split(',').map(k => k.trim()).filter(k => k) || [],
      actionableFeedback: analysis.match(/Actionable feedback:?\s*([^]*)/i)?.[1]?.split('\n').map(f => f.trim()).filter(f => f) || []
    };

    res.status(200).json(result);

  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: error.message });
  }
}