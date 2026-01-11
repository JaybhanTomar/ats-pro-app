# ATS Pro - Resume Analyzer

A powerful, free web app to analyze your resume against job descriptions using AI (Google Gemini), generate cover letters, and optimize resumes for ATS systems.

## Features

- **ATS Analysis**: Evaluate resume match percentage against job descriptions
- **Cover Letter Generation**: AI-powered cover letters tailored to specific jobs
- **Resume Optimization**: Rewrite resumes in LaTeX format for better ATS compatibility
- **File Support**: Upload PDF, DOCX, or TXT files
- **Secure Authentication**: Google sign-in required, API keys protected server-side
- **Access Control**: Only approved users can use the service

## Getting Started

### Prerequisites

- Node.js (v16 or higher)
- npm or yarn

### Installation

1. Clone this repository:
   ```bash
   git clone https://github.com/yourusername/ats-pro.git
   cd ats-pro
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the development server:
   ```bash
   npm run dev
   ```

4. Open [http://localhost:5173](http://localhost:5173) in your browser.

### Building for Production

```bash
npm run build
```

The built files will be in the `dist` folder.

## Deployment to Vercel

### Step 1: Prepare Your Repository

1. **Push your code to GitHub**:
   ```bash
   git add .
   git commit -m "Add Vercel serverless functions"
   git push origin main
   ```

### Step 2: Connect to Vercel

1. **Go to [Vercel.com](https://vercel.com)** and sign up/login
2. **Click "New Project"**
3. **Import your GitHub repository**
4. **Configure the project**:
   - **Framework Preset**: `Vite`
   - **Root Directory**: `./` (leave default)
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`

### Step 3: Set Environment Variables

In Vercel dashboard → Your Project → Settings → Environment Variables:

```
GEMINI_API_KEY = your_gemini_api_key_here
```

**How to get your Gemini API key:**
1. Visit: https://makersuite.google.com/app/apikey
2. Create a new API key
3. Copy the full key (starts with `AIzaSy...`)

### Step 4: Update Firebase Config (Optional)

If you want to keep Google Authentication, update `src/firebase.js`:

```javascript
const firebaseConfig = {
  apiKey: "your-firebase-api-key",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project-id",
  // ... other config
};
```

### Step 5: Deploy

1. **Click "Deploy"** in Vercel
2. **Wait for deployment** (usually 2-3 minutes)
3. **Your app will be live** at `https://your-project.vercel.app`

## API Routes

The app includes these serverless functions:

- `POST /api/analyzeResume` - Analyze resume against job description
- `POST /api/generateCoverLetter` - Generate tailored cover letter
- `POST /api/optimizeResume` - Optimize resume for ATS (returns LaTeX)
- `GET /api/getSubscription` - Get user subscription info

## Security Features

- ✅ **API keys stored server-side only**
- ✅ **No client-side API key exposure**
- ✅ **Rate limiting ready** (can be added)
- ✅ **Authentication checks** (can be enhanced)

## Usage Limits

**Free Tier:**
- 5 resume analyses per month
- 3 cover letters per month
- 2 resume optimizations per month

**Premium Tier:** Unlimited (Stripe integration ready)

### Frontend (Vercel)

1. Push code to GitHub
2. Go to [vercel.com](https://vercel.com) and import the repo
3. Deploy automatically

### Backend (Firebase Functions)

1. Set up Firebase project and enable Functions
2. Deploy functions: `firebase deploy --only functions`
3. Update `src/firebase.js` with your Firebase config
4. Deploy hosting: `firebase deploy --only hosting`

## Usage

1. Sign in with Google
2. Paste a job description (optional, but recommended for targeted analysis).
3. Upload your resume (PDF, DOCX, or TXT) or paste the text.
4. Click "Run ATS Scan" to analyze.
5. Optionally generate a cover letter or optimize your resume.

## Security

- **No API keys in frontend**: Gemini API calls are made server-side
- **Authentication required**: All features require Google sign-in
- **Access control**: Only whitelisted email addresses can use the service
- **Server-side processing**: Sensitive operations happen in Firebase Functions

## Technologies Used

- React 19
- Vite
- Tailwind CSS
- Firebase (Auth, Functions)
- Google Gemini AI
- Mammoth.js (for DOCX parsing)

## License

This project is open source and free to use. Feel free to modify and distribute.

## Contributing

Contributions are welcome! Please open an issue or submit a pull request.
