const fetch = require('node-fetch');

export default async function handler(req, res) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'API key missing' });
    }

    const { resumeText, jobDescription, fileData, mimeType } = req.body;

    if (!jobDescription) {
      return res.status(400).json({ error: 'Job description required' });
    }

    if (!resumeText && !fileData) {
      return res.status(400).json({ error: 'Resume text or file required' });
    }

    const systemPrompt = "You are a professional career writer. Write a concise, compelling cover letter (300 words max) connecting the candidate's specific resume achievements to the job description's requirements. Use a formal but modern tone.";

    let promptText = `GENERATE COVER LETTER:\n\nJOB DESCRIPTION:\n${jobDescription}\n\n`;
    const contentParts = [];

    if (fileData) {
      promptText += "RESUME FILE (See attached PDF):";
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
        temperature: 0.7
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

    const letter = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!letter) {
      throw new Error('Could not generate cover letter');
    }

    res.status(200).json(letter);

  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: error.message });
  }
}