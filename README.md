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

## Deployment

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
