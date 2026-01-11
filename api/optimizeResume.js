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
        temperature: 0.4
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

    let optimizedText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (optimizedText) {
      optimizedText = optimizedText.replace(/```latex|```/g, '').trim();
      res.status(200).send(optimizedText);
    } else {
      throw new Error('Could not generate optimized resume');
    }

  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: error.message });
  }
}