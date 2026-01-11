export default async function handler(req, res) {
  // Only allow GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // For now, return free tier info
    // In production, you'd check user authentication and subscription status
    // You could use Vercel KV, Upstash Redis, or another database

    const subscription = 'FREE'; // Default to free

    const usage = {
      analyses: 0, // You'd track this in a database
      coverLetters: 0,
      optimizations: 0
    };

    const limits = {
      analyses: 5,
      coverLetters: 3,
      optimizations: 2
    };

    res.status(200).json({
      subscription,
      usage,
      limits
    });

  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: error.message });
  }
}