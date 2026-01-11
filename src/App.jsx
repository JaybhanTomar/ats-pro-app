import React, { useState, useCallback, useEffect, useRef } from 'react';
import { auth } from './firebase';
import { signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged } from 'firebase/auth';
import { httpsCallable, getFunctions } from 'firebase/functions';

// --- Utility Functions ---

// 1. API Call with Exponential Backoff
const fetchWithBackoff = async (url, options, retries = 3) => {
    for (let i = 0; i < retries; i++) {
        try {
            const response = await fetch(url, options);
            if (response.ok) return response;
            
            let errorMessage = `HTTP error! status: ${response.status}`;
            try {
                const errorBody = await response.json();
                if (errorBody.error && errorBody.error.message) {
                    errorMessage += `: ${errorBody.error.message}`;
                }
            } catch (e) {
                // Could not read error body
            }

            // Fast fail for auth errors
            if (response.status === 401) {
                throw new Error("Authentication failed (401). API Key missing or invalid.");
            }
            if (response.status === 403) {
                 throw new Error("Access forbidden (403). Permissions issue.");
            }
            if (response.status === 400) {
                 throw new Error(`Bad Request (400). ${errorMessage}`);
            }

            // Throw error for other non-200 status to trigger retry
            throw new Error(errorMessage);
        } catch (error) {
            // Don't retry if it's an auth error or bad request
            if (error.message.includes("401") || error.message.includes("403") || error.message.includes("400") || i === retries - 1) {
                console.error("Fetch failed:", error);
                throw error;
            }
            const delay = Math.pow(2, i) * 1000;
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
};

// 2. Clipboard Copy Function (Robust for Iframes/Preview)
const copyToClipboard = (text, callback) => {
    // Method A: Create a temporary textarea (Works best in iframes/previews)
    const textarea = document.createElement('textarea');
    textarea.value = text;
    
    // Ensure it's not visible but part of the layout to be focusable
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    textarea.style.top = '0';
    textarea.setAttribute('readonly', '');
    
    document.body.appendChild(textarea);
    
    try {
        textarea.select();
        textarea.setSelectionRange(0, 99999); // For mobile devices
        
        const successful = document.execCommand('copy');
        if (successful) {
            callback('Copied to clipboard!');
        } else {
            throw new Error('execCommand failed');
        }
    } catch (err) {
        // Method B: Fallback to modern API if Method A fails
        if (navigator.clipboard) {
            navigator.clipboard.writeText(text)
                .then(() => callback('Copied to clipboard!'))
                .catch(() => callback('Failed to copy. Please select text manually.'));
        } else {
            callback('Failed to copy. Please select text manually.');
        }
    } finally {
        if (document.body.contains(textarea)) {
            document.body.removeChild(textarea);
        }
    }
};

// 3. Download Text Function
const downloadText = (text, filename) => {
    const element = document.createElement("a");
    const file = new Blob([text], {type: 'text/plain'});
    element.href = URL.createObjectURL(file);
    element.download = filename;
    document.body.appendChild(element); 
    element.click();
    document.body.removeChild(element);
};

// --- Constants ---

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

// --- Main Application Component ---

const App = () => {
    // Auth State
    const [user, setUser] = useState(null);
    const [authLoading, setAuthLoading] = useState(true);

    // State Management
    const [jobDescription, setJobDescription] = useState('');
    
    // Resume State (Text vs File)
    const [resumeText, setResumeText] = useState(''); // For TXT/DOCX/Paste
    const [resumeFile, setResumeFile] = useState(null); // For PDF { name, data (base64), type }
    
    // Analysis State
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [results, setResults] = useState(null);
    
    // Cover Letter State
    const [coverLetter, setCoverLetter] = useState(null);
    const [clLoading, setClLoading] = useState(false);
    const [clError, setClError] = useState(null);

    // Optimized Resume State
    const [optimizedResume, setOptimizedResume] = useState(null);
    const [optLoading, setOptLoading] = useState(false);
    const [optError, setOptError] = useState(null);

    // UI Helpers
    const [copyMessage, setCopyMessage] = useState('');

    // Refs for auto-scrolling
    const resultsRef = useRef(null);
    const coverLetterRef = useRef(null);
    const optimizedRef = useRef(null);

    // Form Validation
    const isResumeValid = resumeText.trim().length > 20 || resumeFile !== null; 
    const isJdValid = jobDescription.trim().length > 20;

    // Load Mammoth.js for DOCX support & Load Saved Key
    useEffect(() => {
        if (typeof window !== 'undefined' && !window.mammoth) {
            const script = document.createElement('script');
            script.src = "https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js";
            script.async = true;
            document.body.appendChild(script);
        }
    }, []);

    // Auth state listener
    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (user) => {
            setUser(user);
            setAuthLoading(false);
        });
        return unsubscribe;
    }, []);

    // Auth functions
    const signInWithGoogle = async () => {
        const provider = new GoogleAuthProvider();
        try {
            await signInWithPopup(auth, provider);
        } catch (error) {
            console.error('Error signing in:', error);
        }
    };

    const handleSignOut = async () => {
        try {
            await signOut(auth);
        } catch (error) {
            console.error('Error signing out:', error);
        }
    };

    // Scroll effects
    useEffect(() => {
        if (results && resultsRef.current) {
            resultsRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }, [results]);

    useEffect(() => {
        if (coverLetter && coverLetterRef.current) {
            coverLetterRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }, [coverLetter]);

    useEffect(() => {
        if (optimizedResume && optimizedRef.current) {
            optimizedRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }, [optimizedResume]);

    // Helper to clear all analysis results
    const clearAnalysisResults = () => {
        setResults(null);
        setCoverLetter(null);
        setOptimizedResume(null);
        setError(null);
        setClError(null);
        setOptError(null);
    };

    // Handle File Upload (Universal Support)
    const handleFileUpload = (event) => {
        const file = event.target.files[0];
        if (!file) return;

        // Clear previous results and errors when a new file is uploaded
        clearAnalysisResults();
        setResumeFile(null); 
        
        // 1. PDF Handling (Send as Base64 to API)
        if (file.type === "application/pdf") {
            const reader = new FileReader();
            reader.onload = (e) => {
                const base64Data = e.target.result.split(',')[1]; // Remove "data:application/pdf;base64,"
                setResumeFile({
                    name: file.name,
                    data: base64Data,
                    mimeType: "application/pdf"
                });
                setResumeText(''); // Clear text if PDF is loaded
            };
            reader.onerror = () => setError("Failed to read PDF file.");
            reader.readAsDataURL(file);
        } 
        // 2. DOCX Handling (Extract Text via Mammoth)
        else if (file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" || file.name.endsWith('.docx')) {
            if (!window.mammoth) {
                setError("Document parser is still loading, please try again in a moment.");
                return;
            }
            const reader = new FileReader();
            reader.onload = (e) => {
                const arrayBuffer = e.target.result;
                window.mammoth.extractRawText({ arrayBuffer: arrayBuffer })
                    .then(result => {
                        setResumeText(result.value);
                        setResumeFile(null); // Ensure no file state conflicts
                    })
                    .catch(err => setError("Could not extract text from Word document."));
            };
            reader.readAsArrayBuffer(file);
        }
        // 3. Text/Other Handling (Try to read as Text)
        else {
            const reader = new FileReader();
            reader.onload = (e) => {
                setResumeText(e.target.result);
                setResumeFile(null);
            };
            reader.onerror = () => setError("Failed to read file.");
            reader.readAsText(file);
        }
        
        // Reset the input value so the same file can be selected again if needed
        event.target.value = '';
    };

    const clearFile = () => {
        setResumeFile(null);
        setResumeText('');
        clearAnalysisResults();
    };

    // --- Action 1: Run ATS Analysis ---
    const handleAnalyze = useCallback(async (e) => {
        e.preventDefault();
        if (!user) {
            setError("Please sign in to use this feature.");
            return;
        }
        setError(null);
        setResults(null);
        setLoading(true);

        const mode = isJdValid ? "MATCH" : "CRITIQUE";

        try {
            const analyzeResume = httpsCallable(getFunctions(), 'analyzeResume');
            const result = await analyzeResume({
                resumeText: resumeFile ? null : resumeText,
                jobDescription,
                mode,
                fileData: resumeFile ? resumeFile.data : null,
                mimeType: resumeFile ? resumeFile.mimeType : null
            });
            setResults(result.data);
        } catch (err) {
            setError(err.message || "Analysis failed.");
        } finally {
            setLoading(false);
        }
    }, [isJdValid, jobDescription, resumeText, resumeFile, user]);

    // --- Action 2: Generate Cover Letter ---
    const handleCoverLetter = useCallback(async () => {
        if (!user) {
            setClError("Please sign in to use this feature.");
            return;
        }
        // Validation check inside handler
        if (!isJdValid) {
            setClError("Please paste a Job Description first. A targeted cover letter requires a specific job to match against.");
            return;
        }

        setClError(null);
        setCoverLetter(null);
        setClLoading(true);

        try {
            const generateCoverLetter = httpsCallable(getFunctions(), 'generateCoverLetter');
            const result = await generateCoverLetter({
                resumeText: resumeFile ? null : resumeText,
                jobDescription,
                fileData: resumeFile ? resumeFile.data : null,
                mimeType: resumeFile ? resumeFile.mimeType : null
            });
            setCoverLetter(result.data);
        } catch (err) {
            setClError(err.message || "Generation failed.");
        } finally {
            setClLoading(false);
        }
    }, [jobDescription, resumeText, resumeFile, user, isJdValid]);

    // --- Action 3: Optimize Resume (New Feature - LaTeX) ---
    const handleOptimizeResume = useCallback(async () => {
        if (!user) {
            setOptError("Please sign in to use this feature.");
            return;
        }
        if (!isJdValid) {
            setOptError("Please paste a Job Description first. We need to know which keywords to optimize for.");
            return;
        }

        setOptError(null);
        setOptimizedResume(null);
        setOptLoading(true);

        try {
            const optimizeResume = httpsCallable(getFunctions(), 'optimizeResume');
            const result = await optimizeResume({
                resumeText: resumeFile ? null : resumeText,
                jobDescription,
                fileData: resumeFile ? resumeFile.data : null,
                mimeType: resumeFile ? resumeFile.mimeType : null
            });
            setOptimizedResume(result.data);
        } catch (err) {
            setOptError(err.message || "Optimization failed.");
        } finally {
            setOptLoading(false);
        }
    }, [jobDescription, resumeText, resumeFile, user, isJdValid]);


    // --- Components ---

    const ScoreRing = ({ percentage }) => {
        const radius = 50;
        const circumference = 2 * Math.PI * radius;
        const offset = circumference - (percentage / 100) * circumference;
        
        let color = "text-red-500";
        if (percentage >= 50) color = "text-yellow-500";
        if (percentage >= 80) color = "text-green-500";

        return (
            <div className="relative flex items-center justify-center">
                <svg className="transform -rotate-90 w-32 h-32">
                    <circle cx="64" cy="64" r={radius} stroke="currentColor" strokeWidth="12" fill="transparent" className="text-gray-200" />
                    <circle cx="64" cy="64" r={radius} stroke="currentColor" strokeWidth="12" fill="transparent" className={`${color} transition-all duration-1000 ease-out`} strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round" />
                </svg>
                <span className={`absolute text-2xl font-bold ${color}`}>{percentage}%</span>
            </div>
        );
    };

    return (
        <div className="min-h-screen bg-slate-50 font-sans text-slate-800 selection:bg-indigo-100 selection:text-indigo-800 relative">
            
            {/* Header */}
            <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
                <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                        <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white font-bold text-lg">A</div>
                        <span className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-600 to-purple-600">
                            ATS Pro
                        </span>
                    </div>
                    <div className="flex items-center gap-4">
                        {user ? (
                            <div className="flex items-center gap-4">
                                <span className="text-sm text-slate-600">Welcome, {user.displayName || user.email}</span>
                                <button 
                                    onClick={handleSignOut}
                                    className="text-slate-500 hover:text-indigo-600 transition-colors flex items-center gap-1 text-sm font-medium"
                                >
                                    Sign Out
                                </button>
                            </div>
                        ) : (
                            <button 
                                onClick={signInWithGoogle}
                                className="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors flex items-center gap-2 text-sm font-medium"
                            >
                                <svg className="w-4 h-4" viewBox="0 0 24 24">
                                    <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                                    <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                                    <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                                    <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                                </svg>
                                Sign In
                            </button>
                        )}
                    </div>
                </div>
            </header>

            {authLoading ? (
                <div className="min-h-screen flex items-center justify-center">
                    <div className="text-center">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
                        <p className="text-slate-600">Loading...</p>
                    </div>
                </div>
            ) : !user ? (
                <div className="min-h-screen flex items-center justify-center bg-slate-50">
                    <div className="text-center max-w-md mx-auto p-8">
                        <div className="w-16 h-16 bg-indigo-600 rounded-lg flex items-center justify-center text-white font-bold text-2xl mx-auto mb-6">A</div>
                        <h1 className="text-3xl font-bold text-slate-900 mb-4">Welcome to ATS Pro</h1>
                        <p className="text-slate-600 mb-8">
                            Sign in with Google to analyze your resume, generate cover letters, and optimize for ATS systems.
                        </p>
                        <button 
                            onClick={signInWithGoogle}
                            className="bg-indigo-600 text-white px-8 py-3 rounded-lg hover:bg-indigo-700 transition-colors flex items-center gap-3 mx-auto text-lg font-medium"
                        >
                            <svg className="w-5 h-5" viewBox="0 0 24 24">
                                <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                                <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                                <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                                <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                            </svg>
                            Sign In with Google
                        </button>
                    </div>
                </div>
            ) : (
                <main className="max-w-5xl mx-auto px-4 py-8">
                
                {/* Introduction */}
                <div className="text-center mb-10">
                    <h1 className="text-3xl md:text-4xl font-extrabold text-slate-900 mb-3">
                        ATS Check & Optimize
                    </h1>
                    <p className="text-lg text-slate-600 max-w-2xl mx-auto">
                        Analyze your resume, generate cover letters, and <strong>rewrite your resume content</strong> to pass the bots.
                    </p>
                </div>

                {/* Main Input Section */}
                <div className="bg-white rounded-2xl shadow-xl border border-slate-100 overflow-hidden">
                    <form onSubmit={handleAnalyze} className="p-6 md:p-8 space-y-8">
                        
                        {/* 1. Job Description */}
                        <div className="space-y-3">
                            <label className="flex items-center justify-between text-sm font-semibold text-slate-700 uppercase tracking-wide">
                                <span>1. Job Description (Optional)</span>
                                <span className="text-xs font-normal normal-case text-slate-400 bg-slate-50 px-2 py-1 rounded-full border border-slate-200">
                                    {jobDescription.length} chars
                                </span>
                            </label>
                            <textarea
                                className="w-full h-40 p-4 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all resize-y text-sm leading-relaxed"
                                placeholder="Paste the complete job description here..."
                                value={jobDescription}
                                onChange={(e) => setJobDescription(e.target.value)}
                            />
                        </div>

                        {/* 2. Resume */}
                        <div className="space-y-3">
                             <div className="flex items-center justify-between">
                                <label className="text-sm font-semibold text-slate-700 uppercase tracking-wide">
                                    2. Your Resume (Required)
                                </label>
                                {resumeFile && (
                                    <button 
                                        type="button" 
                                        onClick={clearFile}
                                        className="text-xs text-red-500 hover:text-red-700 font-medium underline"
                                    >
                                        Remove File & Reset
                                    </button>
                                )}
                            </div>
                            
                            <div className="relative">
                                {/* If PDF File is loaded, show File Card instead of Textarea */}
                                {resumeFile ? (
                                    <div className="w-full h-64 flex flex-col items-center justify-center bg-indigo-50 border-2 border-dashed border-indigo-200 rounded-xl">
                                        <svg className="w-16 h-16 text-indigo-400 mb-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd"></path></svg>
                                        <p className="text-lg font-bold text-indigo-900">{resumeFile.name}</p>
                                        <p className="text-sm text-indigo-600 mt-1">PDF loaded successfully.</p>
                                        <p className="text-xs text-indigo-400 mt-2">The AI will read this file visually.</p>
                                    </div>
                                ) : (
                                    // Text Area for Paste/DOCX/TXT
                                    <textarea
                                        className="w-full h-64 p-4 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all resize-y text-sm leading-relaxed font-mono text-slate-600"
                                        placeholder="Paste your resume text here OR upload a PDF/DOCX file..."
                                        value={resumeText}
                                        onChange={(e) => setResumeText(e.target.value)}
                                        required={!resumeFile}
                                    />
                                )}
                                
                                {/* File Upload Overlay (Only show if no file is selected) */}
                                {!resumeFile && !resumeText && (
                                    <div className="absolute bottom-4 right-4">
                                        <label className="cursor-pointer bg-white border border-slate-200 hover:border-indigo-300 text-indigo-600 text-xs font-semibold py-2 px-3 rounded-lg shadow-sm transition-colors flex items-center">
                                            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                                            Upload PDF, DOCX, TXT
                                            <input 
                                                type="file" 
                                                accept=".pdf,.docx,.doc,.txt,text/plain,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" 
                                                className="hidden" 
                                                onChange={handleFileUpload} 
                                            />
                                        </label>
                                    </div>
                                )}
                                
                                {/* Allow upload even if text exists (to overwrite) */}
                                {resumeText && !resumeFile && (
                                    <div className="absolute bottom-4 right-4">
                                         <label className="cursor-pointer bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-semibold py-2 px-3 rounded-lg transition-colors flex items-center">
                                            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                                            Replace with File
                                            <input 
                                                type="file" 
                                                accept=".pdf,.docx,.doc,.txt,text/plain,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" 
                                                className="hidden" 
                                                onChange={handleFileUpload} 
                                            />
                                        </label>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Action Bar */}
                        <div className="flex flex-col sm:flex-row gap-4 pt-4 border-t border-slate-100">
                            <button
                                type="submit"
                                disabled={!isResumeValid || loading}
                                className={`flex-1 py-4 px-6 rounded-xl font-bold text-white shadow-lg flex items-center justify-center space-x-2 transition-transform transform active:scale-95 ${
                                    !isResumeValid || loading 
                                    ? 'bg-slate-300 cursor-not-allowed' 
                                    : 'bg-indigo-600 hover:bg-indigo-700 hover:shadow-indigo-200'
                                }`}
                            >
                                {loading ? (
                                    <span className="flex items-center">
                                        <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                                         Analyzing Resume...
                                    </span>
                                ) : (
                                    <>
                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"></path></svg>
                                        <span>{isJdValid ? 'Run ATS Scan' : 'Critique Resume'}</span>
                                    </>
                                )}
                            </button>

                            <button
                                type="button"
                                onClick={handleCoverLetter}
                                disabled={!isResumeValid || clLoading}
                                className={`flex-1 py-4 px-6 rounded-xl font-bold border-2 flex items-center justify-center space-x-2 transition-colors ${
                                    !isResumeValid
                                    ? 'border-slate-100 text-slate-300 cursor-not-allowed'
                                    : 'border-purple-100 text-purple-600 bg-purple-50 hover:bg-purple-100 hover:border-purple-200'
                                }`}
                            >
                                {clLoading ? (
                                    <span className="flex items-center">
                                         <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-purple-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                                        Drafting...
                                    </span>
                                ) : (
                                    <>
                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg>
                                        <span>Draft Cover Letter</span>
                                    </>
                                )}
                            </button>

                            {/* New Button: Auto-Optimize */}
                            <button
                                type="button"
                                onClick={handleOptimizeResume}
                                disabled={!isResumeValid || optLoading}
                                className={`flex-1 py-4 px-6 rounded-xl font-bold border-2 flex items-center justify-center space-x-2 transition-colors ${
                                    !isResumeValid
                                    ? 'border-slate-100 text-slate-300 cursor-not-allowed'
                                    : 'border-blue-100 text-blue-600 bg-blue-50 hover:bg-blue-100 hover:border-blue-200'
                                }`}
                            >
                                {optLoading ? (
                                    <span className="flex items-center">
                                         <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                                        Rewriting...
                                    </span>
                                ) : (
                                    <>
                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path></svg>
                                        <span>Optimize Resume</span>
                                    </>
                                )}
                            </button>
                        </div>

                        {/* Errors */}
                        {(error || clError || optError) && (
                            <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded-r shadow-sm">
                                <div className="flex">
                                    <div className="flex-shrink-0">
                                        <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" /></svg>
                                    </div>
                                    <div className="ml-3">
                                        <p className="text-sm text-red-700 font-medium">
                                            {error || clError || optError}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        )}
                    </form>
                </div>

                {/* --- Results Section --- */}
                {results && (
                    <div ref={resultsRef} className="mt-8 animate-fade-in-up space-y-6">
                        <div className="bg-white rounded-2xl shadow-xl overflow-hidden border border-slate-100">
                            
                            {/* Result Header */}
                            <div className="bg-slate-50 border-b border-slate-100 p-6 flex items-center justify-between">
                                <h2 className="text-xl font-bold text-slate-800 flex items-center">
                                    <span className="w-2 h-8 bg-indigo-500 rounded-full mr-3"></span>
                                    Analysis Report
                                </h2>
                                <span className="text-sm text-slate-500 font-medium">
                                    {isJdValid ? 'Targeted Scan' : 'General Critique'}
                                </span>
                            </div>

                            <div className="p-6 md:p-8">
                                <div className="flex flex-col md:flex-row gap-8 items-center mb-10">
                                    {/* Score */}
                                    <div className="flex-shrink-0">
                                        <ScoreRing percentage={results.matchPercentage} />
                                    </div>
                                    {/* Summary */}
                                    <div className="flex-grow">
                                        <h3 className="text-lg font-bold text-slate-800 mb-2">Executive Summary</h3>
                                        <p className="text-slate-600 leading-relaxed bg-slate-50 p-4 rounded-lg border border-slate-100">
                                            {results.summary}
                                        </p>
                                    </div>
                                </div>

                                {/* Keywords Grid */}
                                <div className="grid md:grid-cols-2 gap-8">
                                    {/* Found */}
                                    <div>
                                        <h4 className="flex items-center text-sm font-bold text-slate-500 uppercase tracking-wider mb-4">
                                            <span className="w-2 h-2 bg-green-500 rounded-full mr-2"></span>
                                            Keywords Matched
                                        </h4>
                                        <div className="flex flex-wrap gap-2">
                                            {results.keywordsFound.length > 0 ? (
                                                results.keywordsFound.map((k, i) => (
                                                    <span key={i} className="px-3 py-1 bg-green-50 text-green-700 text-sm font-medium rounded-full border border-green-100">
                                                        {k}
                                                    </span>
                                                ))
                                            ) : (
                                                <span className="text-slate-400 text-sm italic">No major keywords found.</span>
                                            )}
                                        </div>
                                    </div>

                                    {/* Missing */}
                                    <div>
                                        <h4 className="flex items-center text-sm font-bold text-slate-500 uppercase tracking-wider mb-4">
                                            <span className="w-2 h-2 bg-red-500 rounded-full mr-2"></span>
                                            Missing / Critical
                                        </h4>
                                        <div className="flex flex-wrap gap-2">
                                            {results.keywordsMissing.length > 0 ? (
                                                results.keywordsMissing.map((k, i) => (
                                                    <span key={i} className="px-3 py-1 bg-red-50 text-red-700 text-sm font-medium rounded-full border border-red-100">
                                                        {k}
                                                    </span>
                                                ))
                                            ) : (
                                                <span className="text-slate-400 text-sm italic">Great job! No critical keywords missing.</span>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* Feedback */}
                                <div className="mt-10 pt-8 border-t border-slate-100">
                                    <h4 className="text-lg font-bold text-slate-800 mb-4 flex items-center">
                                        <svg className="w-5 h-5 mr-2 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
                                        Action Plan
                                    </h4>
                                    <ul className="space-y-3">
                                        {results.actionableFeedback.map((item, i) => (
                                            <li key={i} className="flex items-start">
                                                <svg className="w-5 h-5 text-indigo-400 mr-3 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                                                <span className="text-slate-700 text-sm">{item}</span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* --- Cover Letter Section --- */}
                {coverLetter && (
                    <div ref={coverLetterRef} className="mt-8 animate-fade-in-up">
                        <div className="bg-white rounded-2xl shadow-xl overflow-hidden border border-slate-100">
                            <div className="bg-gradient-to-r from-purple-50 to-white p-6 border-b border-purple-100 flex items-center justify-between">
                                <h2 className="text-xl font-bold text-purple-900 flex items-center">
                                    <svg className="w-6 h-6 mr-2 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"></path></svg>
                                    Generated Cover Letter
                                </h2>
                                <button
                                    onClick={() => {
                                        copyToClipboard(coverLetter, setCopyMessage);
                                        setTimeout(() => setCopyMessage(''), 3000);
                                    }}
                                    className="text-sm bg-white border border-purple-200 text-purple-700 px-3 py-1.5 rounded-lg font-medium hover:bg-purple-50 transition-colors flex items-center"
                                >
                                    {copyMessage ? (
                                        <span className="text-green-600 font-bold">{copyMessage}</span>
                                    ) : (
                                        <>
                                            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5h6m-6 0L9 3h3l1 2M18 7v6M14 4h7a1 1 0 011 1v12a1 1 0 01-1 1h-7a1 1 0 01-1-1V5a1 1 0 011-1z"></path></svg>
                                            Copy Text
                                        </>
                                    )}
                                </button>
                            </div>
                            <div className="p-8 bg-white">
                                <div className="prose prose-slate max-w-none font-serif text-slate-700 leading-relaxed whitespace-pre-wrap">
                                    {coverLetter}
                                </div>
                            </div>
                        </div>
                    </div>
                )}
                
                {/* --- Optimized Resume Section (New - LaTeX) --- */}
                {optimizedResume && (
                    <div ref={optimizedRef} className="mt-8 animate-fade-in-up">
                        <div className="bg-white rounded-2xl shadow-xl overflow-hidden border border-slate-100">
                            <div className="bg-gradient-to-r from-blue-50 to-white p-6 border-b border-blue-100 flex items-center justify-between">
                                <h2 className="text-xl font-bold text-blue-900 flex items-center">
                                    <svg className="w-6 h-6 mr-2 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg>
                                    ✨ Optimized Resume (LaTeX)
                                </h2>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => downloadText(optimizedResume, "Optimized_Resume.tex")}
                                        className="text-sm bg-white border border-blue-200 text-blue-700 px-3 py-1.5 rounded-lg font-medium hover:bg-blue-50 transition-colors flex items-center"
                                    >
                                        <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
                                        Download .tex
                                    </button>
                                    <button
                                        onClick={() => {
                                            copyToClipboard(optimizedResume, setCopyMessage);
                                            setTimeout(() => setCopyMessage(''), 3000);
                                        }}
                                        className="text-sm bg-white border border-blue-200 text-blue-700 px-3 py-1.5 rounded-lg font-medium hover:bg-blue-50 transition-colors flex items-center"
                                    >
                                        {copyMessage ? (
                                            <span className="text-green-600 font-bold">{copyMessage}</span>
                                        ) : (
                                            <>
                                                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5h6m-6 0L9 3h3l1 2M18 7v6M14 4h7a1 1 0 011 1v12a1 1 0 01-1 1h-7a1 1 0 01-1-1V5a1 1 0 011-1z"></path></svg>
                                                Copy Code
                                            </>
                                        )}
                                    </button>
                                </div>
                            </div>
                            <div className="p-8 bg-white">
                                <div className="text-sm text-blue-800 bg-blue-50 p-4 rounded-lg mb-6 border border-blue-200 flex items-start">
                                    <svg className="w-5 h-5 text-blue-600 mr-2 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                                    <div>
                                        <strong>How to create your PDF:</strong>
                                        <p className="mt-1">
                                            This is complete, ATS-Friendly LaTeX code.
                                        </p>
                                        <ol className="list-decimal ml-4 mt-2 space-y-1">
                                            <li>Download the <code>.tex</code> file using the button above.</li>
                                            <li>Go to <a href="https://www.overleaf.com" target="_blank" rel="noreferrer" className="underline font-bold text-blue-700">Overleaf.com</a> (free) or install a LaTeX editor.</li>
                                            <li>Create a new project and paste this code (or upload the file).</li>
                                            <li>Click "Recompile" to get your perfect, ATS-optimized PDF!</li>
                                        </ol>
                                    </div>
                                </div>
                                <div className="max-h-96 overflow-y-auto bg-gray-900 text-gray-100 p-4 rounded-lg font-mono text-xs shadow-inner">
                                    <pre className="whitespace-pre-wrap">{optimizedResume}</pre>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

            </main>
            )}
        </div>
    );
};

export default App;
