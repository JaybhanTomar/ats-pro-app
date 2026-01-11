# ATS Pro - Resume Analyzer

A powerful, free web app to analyze your resume against job descriptions using AI (Google Gemini), generate cover letters, and optimize resumes for ATS systems.

## Features

- **ATS Analysis**: Evaluate resume match percentage against job descriptions
- **Cover Letter Generation**: AI-powered cover letters tailored to specific jobs
- **Resume Optimization**: Rewrite resumes in LaTeX format for better ATS compatibility
- **File Support**: Upload PDF, DOCX, or TXT files
- **Free to Use**: Powered by your own Google Gemini API key (stored locally)

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

## Publishing for Free

### Option 1: Vercel (Recommended)

1. Go to [vercel.com](https://vercel.com) and sign up for a free account.
2. Connect your GitHub account.
3. Click "New Project" and import this repository.
4. Vercel will automatically detect it as a Vite React app and deploy it.
5. Your app will be live at a URL like `https://ats-pro.vercel.app`.

### Option 2: Netlify

1. Go to [netlify.com](https://netlify.com) and sign up.
2. Click "Sites" > "Deploy manually".
3. Drag and drop the `dist` folder (after running `npm run build`) into the deploy area.
4. Your site will be live instantly.

### Option 3: GitHub Pages

1. Install gh-pages: `npm install --save-dev gh-pages`
2. Add to package.json scripts: `"deploy": "gh-pages -d dist"`
3. Run `npm run build && npm run deploy`
4. Enable GitHub Pages in your repo settings.

## Usage

1. Paste a job description (optional, but recommended for targeted analysis).
2. Upload your resume (PDF, DOCX, or TXT) or paste the text.
3. Click "Run ATS Scan" to analyze.
4. Optionally generate a cover letter or optimize your resume.

## API Key Setup

To use the AI features:
1. Get a free Google Gemini API key from [Google AI Studio](https://aistudio.google.com/app/apikey).
2. In the app, click the Settings gear icon.
3. Paste your API key (it's stored locally in your browser).

## Technologies Used

- React 19
- Vite
- Tailwind CSS
- Google Gemini AI
- Mammoth.js (for DOCX parsing)

## License

This project is open source and free to use. Feel free to modify and distribute.

## Contributing

Contributions are welcome! Please open an issue or submit a pull request.
