export const maxDuration = 60; // Timeout handle karne ke liye

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST method only bhai!' });

  const { mistakeLogs } = req.body;
  if (!mistakeLogs || mistakeLogs.length === 0) {
      return res.status(400).json({ error: 'No mistake logs provided' });
  }

  // EdgeOne/Vercel environment variable
  const API_KEY = process.env.GEMINI_OFFICIAL_KEY; 

  const systemPrompt = `You are a strict, analytical exam coach for a student preparing for Indian Government Exams (SSC, Bank).
Analyze the provided JSON array of the student's Mistake Logs for this week.
Identify recurring weaknesses, root causes, and provide an actionable, bulleted plan to fix them.
Tone: Honest, direct, and slightly strict (Aman Bhaiya style, pure Hinglish but in Latin script).

You MUST output ONLY a valid JSON object with exactly two keys:
{
  "causes": "Detailed analysis of what went wrong based on the logs (Use bullet points)",
  "plans": "Step-by-step actionable execution plan for the next week (Use bullet points)"
}
Do NOT output any markdown blocks like \`\`\`json. Return pure JSON string.`;

  try {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash :generateContent?key=${API_KEY}`;
    
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: systemPrompt + "\n\nLogs:\n" + JSON.stringify(mistakeLogs) }] }],
        generationConfig: { responseMimeType: "application/json", temperature: 0.7 }
      })
    });

    if (!response.ok) throw new Error(await response.text());
    
    const data = await response.json();
    let rawText = data.candidates[0].content.parts[0].text;
    
    // Safely parse JSON
    const cleanJson = JSON.parse(rawText.replace(/```json/g, '').replace(/```/g, '').trim());
    
    return res.status(200).json(cleanJson);

  } catch (error) {
    console.error("Gemini API Error:", error);
    return res.status(500).json({ error: 'Analysis failed.', details: error.message });
  }
}
