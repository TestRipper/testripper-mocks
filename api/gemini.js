export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Only POST allowed bhai!' });
  }

  // Teri multiple keys Vercel se yahan aayengi
  // Vercel me GEMINI_API_KEY_1, GEMINI_API_KEY_2 set kar lena
  const keys = [
    process.env.GEMINI_API_KEY_1
  ].filter(Boolean); // Jo key khali hogi use hata dega

  if (keys.length === 0) {
    return res.status(500).json({ error: 'Vercel me API Key missing hai!' });
  }

  const model = req.body.model || "gemini-3.7-flash";
  let lastError = null;

  // Failover Loop: Ek key fail hui toh dusri try karega
  for (let i = 0; i < keys.length; i++) {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${keys[i]}`;

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req.body.payload)
      });

      if (!response.ok) {
        // Agar Quota Exceeded (429) ya error hai, toh next key pe jayega
        lastError = await response.text();
        console.warn(`Key ${i + 1} failed. Trying next...`);
        continue; 
      }

      const data = await response.json();
      return res.status(200).json(data); // Success! Frontend ko data bhej do
      
    } catch (error) {
      lastError = error.message;
    }
  }

  // Agar saari keys fail ho gayi tab ye error aayega
  return res.status(500).json({ error: 'All API keys exhausted!', details: lastError });
}
