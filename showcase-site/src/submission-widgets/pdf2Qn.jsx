import React, { useState, useCallback, useRef, useEffect } from 'react';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { GlobalWorkerOptions } from 'pdfjs-dist/build/pdf';
import * as pdfjsLib from 'pdfjs-dist/build/pdf';
import Carousel from 'react-multi-carousel';
import 'react-multi-carousel/lib/styles.css';

GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/legacy/build/pdf.worker.min.mjs', import.meta.url).toString();

const PdfQuestionWidget = () => {
  const [file, setFile] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedAnswers, setSelectedAnswers] = useState({});
  const [score, setScore] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [showExplanation, setShowExplanation] = useState(false);
  const [explanations, setExplanations] = useState({});
  const [currentSlide, setCurrentSlide] = useState(0);
  const [currentPage, setCurrentPage] = useState('upload'); // 'upload', 'list', or 'explanation'
  const [pdfList, setPdfList] = useState([]);
  const carouselRef = useRef(null);

  const carouselResponsive = {
    desktop: {
      breakpoint: { max: 3000, min: 1024 },
      items: 1,
      slidesToSlide: 1
    },
    tablet: {
      breakpoint: { max: 1024, min: 464 },
      items: 1,
      slidesToSlide: 1
    },
    mobile: {
      breakpoint: { max: 464, min: 0 },
      items: 1,
      slidesToSlide: 1
    }
  };

  const handleDragEnter = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile && droppedFile.type === 'application/pdf') {
      setFile(droppedFile);
      setError(null);
    } else {
      setError('Please drop a valid PDF file');
      setFile(null);
    }
  }, []);

  const handleFileChange = (event) => {
    const selectedFile = event.target.files[0];
    if (selectedFile && selectedFile.type === 'application/pdf') {
      setFile(selectedFile);
      setError(null);
    } else {
      setError('Please select a valid PDF file');
      setFile(null);
    }
  };

  const generateExplanation = async (question, userAnswer) => {
    const genAI = new GoogleGenerativeAI(import.meta.env.VITE_GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const prompt = `Question: ${question.question}\n
    Options: ${question.options.join(', ')}\n
    Correct Answer: ${question.correctAnswer}\n
    User's Answer: ${userAnswer}\n
    Please provide a brief explanation of why the correct answer is ${question.correctAnswer} and why ${userAnswer} is incorrect. Keep the explanation concise and clear.`;

    try {
      const result = await model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();
      return text;
    } catch (err) {
      console.error('Error generating explanation:', err);
      return 'Unable to generate explanation.';
    }
  };

  const handleAnswerSelect = async (questionIndex, answer) => {
    if (selectedAnswers[questionIndex] !== undefined) return;
    
    setSelectedAnswers(prev => ({
      ...prev,
      [questionIndex]: answer
    }));

    const isCorrect = answer === questions[questionIndex].correctAnswer;
    setScore(prev => isCorrect ? prev + 1 : prev);

    if (!isCorrect) {
      const explanation = await generateExplanation(questions[questionIndex], answer);
      setExplanations(prev => ({
        ...prev,
        [questionIndex]: explanation
      }));
    }

    setTimeout(() => {
      if (questionIndex < questions.length - 1) {
        setCurrentSlide(questionIndex + 1);
        if (carouselRef.current) {
          carouselRef.current.goToSlide(questionIndex + 1);
        }
      }
    }, 500);
  };

  const resetQuiz = () => {
    setSelectedAnswers({});
    setScore(0);
    setExplanations({});
    setShowExplanation(false);
  };

  const extractTextFromPDF = async (file) => {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let fullText = '';

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map(item => item.str).join(' ');
      fullText += pageText + '\n';
    }

    return fullText;
  };

  const generateQuestions = async () => {
    if (!file) {
      setError('Please upload a PDF file first');
      return;
    }

    setLoading(true);
    setError(null);
    resetQuiz();

    try {
      const pdfContent = await extractTextFromPDF(file);
      const genAI = new GoogleGenerativeAI(import.meta.env.VITE_GEMINI_API_KEY);
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

      const prompt = `Based on the following content, generate 5 multiple choice questions with 4 options each. Format the response as a JSON array with objects containing 'question', 'options', and 'correctAnswer' fields. Make sure the questions are clear and the options are distinct:\n\n${pdfContent}`;
      
      const result = await model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();
      
      try {
        const cleanText = text.replace(/```json\n?|\n?```/g, '').trim();
        const parsedQuestions = JSON.parse(cleanText);
        setQuestions(parsedQuestions);
      } catch (parseError) {
        console.error('Parse error:', parseError);
        setError('Failed to parse questions. Please try again.');
      }
    } catch (err) {
      setError('Failed to generate questions. Please try again.');
      console.error('Error:', err);
    } finally {
      setLoading(false);
    }
  };

  const renderQuestion = (question, index) => {
    const isAnswered = selectedAnswers[index] !== undefined;
    const isCorrect = selectedAnswers[index] === question.correctAnswer;

    return (
      <div className="p-4 bg-white rounded-lg shadow-md text-center">
        <div className="mb-4">
          <p className="text-base text-gray-700 mb-4">{question.question}</p>
          
          <div className="space-y-2 max-w-md mx-auto">
            {question.options.map((option, optIndex) => {
              const isSelected = selectedAnswers[index] === option;
              const isCorrectAnswer = isAnswered && option === question.correctAnswer;
              
              let optionClasses = "p-2 rounded-lg cursor-pointer transition-colors text-sm text-center";
              if (isAnswered) {
                if (isCorrectAnswer) {
                  optionClasses += " bg-green-100 text-green-800";
                } else if (isSelected) {
                  optionClasses += " bg-red-100 text-red-800";
                } else {
                  optionClasses += " bg-gray-50 text-gray-700";
                }
              } else {
                optionClasses += isSelected 
                  ? " bg-blue-100 text-blue-800" 
                  : " bg-gray-50 hover:bg-gray-100 text-gray-700";
              }

              return (
                <div
                  key={optIndex}
                  className={optionClasses}
                  onClick={() => !isAnswered && handleAnswerSelect(index, option)}
                >
                  {option}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  const handleSaveQuiz = async () => {
    if (file && questions.length > 0) {
      try {
        // Convert File to ArrayBuffer for storage
        const fileData = await file.arrayBuffer();
        
        setPdfList(prev => [...prev, {
          id: Date.now(),
          name: file.name,
          file: file,
          fileData: fileData, // Store the file data
          fileName: file.name,
          date: new Date().toLocaleDateString(),
          questions: questions,
          score: score,
          totalQuestions: questions.length
        }]);
        setCurrentPage('list');
      } catch (error) {
        console.error('Error saving quiz:', error);
        setError('Failed to save quiz. Please try again.');
      }
    }
  };

  const handlePdfSelect = async (pdfItem) => {
    try {
      // Create a new File object from the stored data
      const file = new File([pdfItem.fileData], pdfItem.fileName, { type: 'application/pdf' });
      setFile(file);
      setQuestions(pdfItem.questions);
      setSelectedAnswers({});
      setScore(0);
      setError(null);
      setExplanations({});
      setShowExplanation(false);
      setCurrentPage('upload');
    } catch (error) {
      console.error('Error loading quiz:', error);
      setError('Failed to load quiz. Please try again.');
    }
  };

  const handleDeletePdf = (pdfId) => {
    setPdfList(prev => prev.filter(item => item.id !== pdfId));
  };

  const clearAll = () => {
    setFile(null);
    setQuestions([]);
    setSelectedAnswers({});
    setScore(0);
    setError(null);
    setExplanations({});
    setShowExplanation(false);
    setPdfList([]);
  };

  // Load saved quizzes from localStorage on component mount
  useEffect(() => {
    const savedQuizzes = localStorage.getItem('savedQuizzes');
    if (savedQuizzes) {
      try {
        const parsedQuizzes = JSON.parse(savedQuizzes);
        // Convert the stored file data back to File objects
        const quizzesWithFiles = parsedQuizzes.map(quiz => ({
          ...quiz,
          file: new File([quiz.fileData], quiz.fileName, { type: 'application/pdf' })
        }));
        setPdfList(quizzesWithFiles);
      } catch (error) {
        console.error('Error loading saved quizzes:', error);
      }
    }
  }, []);

  // Save quizzes to localStorage whenever pdfList changes
  useEffect(() => {
    if (pdfList.length > 0) {
      try {
        // Convert File objects to a format that can be stored in localStorage
        const serializedQuizzes = pdfList.map(quiz => ({
          ...quiz,
          fileName: quiz.file.name,
          fileData: quiz.fileData // We'll store this when saving the quiz
        }));
        localStorage.setItem('savedQuizzes', JSON.stringify(serializedQuizzes));
      } catch (error) {
        console.error('Error saving quizzes:', error);
      }
    } else {
      localStorage.removeItem('savedQuizzes');
    }
  }, [pdfList]);

  const renderExplanationPage = () => {
    const incorrectQuestions = questions.filter((q, index) => selectedAnswers[index] !== q.correctAnswer);

    return (
      <div className="space-y-4">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-lg font-semibold text-gray-800">Explanation Page</h3>
          <button
            onClick={() => setCurrentPage('upload')}
            className="p-2 rounded-full bg-blue-50 hover:bg-blue-100 text-blue-600 transition-all duration-300 hover:shadow-md hover:scale-105"
            title="Back to Quiz"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
          </button>
        </div>

        {incorrectQuestions.length === 0 ? (
          <div className="text-center py-8">
            <div className="text-6xl mb-4">🎉</div>
            <p className="text-xl font-semibold text-green-600">Perfect Score!</p>
            <p className="text-gray-600 mt-2">You got all questions correct!</p>
          </div>
        ) : (
          <div className="space-y-6">
            {incorrectQuestions.map((q, index) => {
              const originalIndex = questions.findIndex(question => question === q);
              return (
                <div key={index} className="bg-white p-6 rounded-lg shadow-md">
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-sm font-medium text-gray-500">Question {originalIndex + 1}</span>
                    <span className="text-sm font-medium text-red-600">Incorrect</span>
                  </div>
                  
                  <p className="text-base text-gray-800 mb-4">{q.question}</p>
                  
                  <div className="space-y-2 mb-4">
                    {q.options.map((option, optIndex) => {
                      const isSelected = selectedAnswers[originalIndex] === option;
                      const isCorrect = option === q.correctAnswer;
                      
                      let optionClasses = "p-3 rounded-lg text-sm";
                      if (isCorrect) {
                        optionClasses += " bg-green-50 text-green-800 border border-green-200";
                      } else if (isSelected) {
                        optionClasses += " bg-red-50 text-red-800 border border-red-200";
                      } else {
                        optionClasses += " bg-gray-50 text-gray-700 border border-gray-200";
                      }

                      return (
                        <div key={optIndex} className={optionClasses}>
                          {option}
                        </div>
                      );
                    })}
                  </div>

                  <div className="bg-blue-50 p-4 rounded-lg">
                    <h4 className="text-sm font-medium text-blue-800 mb-2">Explanation:</h4>
                    <p className="text-sm text-blue-700">{explanations[originalIndex]}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="p-3 max-w-md mx-auto bg-gradient-to-br from-white via-blue-50 to-purple-50 rounded-xl shadow-lg text-center border border-blue-100 max-h-[90vh] overflow-y-auto">
      <div className="space-y-3">
        <div className="flex justify-between items-center sticky top-0 bg-gradient-to-br from-white via-blue-50 to-purple-50 py-2 z-10">
          <div className="flex items-center space-x-2">
            <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <h2 className="text-xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-purple-600">
              {currentPage === 'explanation' ? 'Explanation Page' : 'PDF Question Generator'}
            </h2>
          </div>
          <div className="flex items-center space-x-2">
            {currentPage !== 'explanation' && (
              <button
                onClick={() => setCurrentPage(currentPage === 'upload' ? 'list' : 'upload')}
                className="p-1.5 rounded-full bg-blue-50 hover:bg-blue-100 text-blue-600 transition-all duration-300 hover:shadow-md hover:scale-105"
                title={currentPage === 'upload' ? 'View PDF List' : 'Back to Upload'}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  {currentPage === 'upload' ? (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                  ) : (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                  )}
                </svg>
              </button>
            )}
            {questions.length > 0 && currentPage !== 'explanation' && (
              <button
                onClick={clearAll}
                className="p-1.5 rounded-full bg-red-50 hover:bg-red-100 text-red-600 transition-all duration-300 hover:shadow-md hover:scale-105"
                title="Clear all"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            )}
          </div>
        </div>
        
        {currentPage === 'explanation' ? (
          renderExplanationPage()
        ) : currentPage === 'upload' ? (
          <div className="space-y-3">
            <div 
              className={`relative border-2 border-dashed rounded-lg transition-all duration-300 ease-in-out
                ${questions.length > 0 ? 'p-3' : 'p-6'}
                ${isDragging ? 'border-blue-500 bg-blue-50 shadow-lg scale-102' : 'border-blue-200 hover:border-blue-400 hover:shadow-md'}
                ${file ? 'border-green-500 bg-green-50' : ''}`}
              onDragEnter={handleDragEnter}
              onDragLeave={handleDragLeave}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
            >
              <div className="text-center">
                <div className={`mx-auto transition-all duration-300 ${questions.length > 0 ? 'w-8 h-8' : 'w-12 h-12'} bg-blue-50 rounded-full flex items-center justify-center`}>
                  <svg className={`transition-all duration-300 text-blue-500 ${questions.length > 0 ? 'h-4 w-4' : 'h-6 w-6'}`} stroke="currentColor" fill="none" viewBox="0 0 48 48">
                    <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                <p className={`transition-all duration-300 ${questions.length > 0 ? 'mt-1 text-xs' : 'mt-2 text-sm'} text-gray-600`}>
                  {file ? (
                    <span className="text-green-600 font-medium text-base">{file.name}</span>
                  ) : (
                    <>
                      {questions.length > 0 ? 'Drop new PDF or ' : 'Drag and drop your PDF file here, or '}
                      <label className="text-blue-600 hover:text-blue-800 cursor-pointer transition-colors">
                        <span className="font-medium border-b-2 border-blue-300 hover:border-blue-600">browse</span>
                        <input
                          type="file"
                          accept=".pdf"
                          onChange={handleFileChange}
                          className="hidden"
                        />
                      </label>
                    </>
                  )}
                </p>
                {!questions.length > 0 && <p className="mt-1 text-xs text-gray-500">PDF files only</p>}
              </div>
            </div>
            {error && (
              <div className="bg-red-50 border-l-4 border-red-500 p-3 rounded-md animate-fade-in">
                <p className="text-red-700 text-xs">{error}</p>
              </div>
            )}

            <div className="flex justify-center">
              <button
                onClick={generateQuestions}
                disabled={loading || !file}
                className={`px-4 py-2 rounded-lg font-semibold text-white text-sm text-center transition-all duration-300 transform hover:scale-105
                  ${loading || !file 
                    ? 'bg-gray-400 cursor-not-allowed' 
                    : 'bg-gradient-to-r from-blue-600 to-purple-600 hover:shadow-lg'}`}
              >
                {loading ? (
                  <span className="flex items-center">
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Generating Questions...
                  </span>
                ) : 'Generate Questions'}
              </button>
            </div>

            {questions.length > 0 && (
              <div className="space-y-3 mt-4">
                <div className="max-w-xs mx-auto">
                  <div className="flex justify-between mb-1">
                    <span className="text-xs font-medium text-gray-700">
                      Progress
                    </span>
                    <span className="text-xs font-medium text-blue-600">
                      {Math.round((Object.keys(selectedAnswers).length / questions.length) * 100)}%
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-1.5">
                    <div 
                      className="bg-gradient-to-r from-blue-600 to-purple-600 h-1.5 rounded-full transition-all duration-500"
                      style={{ width: `${(Object.keys(selectedAnswers).length / questions.length) * 100}%` }}
                    ></div>
                  </div>
                </div>
                <Carousel
                  ref={carouselRef}
                  responsive={carouselResponsive}
                  infinite={false}
                  containerClass="pb-1"
                  itemClass="px-1"
                  customButtonGroup={<div className="flex justify-center space-x-2 mt-4">
                    <button 
                      className="p-2 rounded-full bg-white hover:bg-gray-100 transition-all duration-300 shadow-md hover:shadow-lg hover:scale-105"
                      onClick={() => {
                        if (currentSlide > 0) {
                          setCurrentSlide(currentSlide - 1);
                          carouselRef.current.goToSlide(currentSlide - 1);
                        }
                      }}
                    >
                      <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                      </svg>
                    </button>
                    <button 
                      className="p-2 rounded-full bg-white hover:bg-gray-100 transition-all duration-300 shadow-md hover:shadow-lg hover:scale-105"
                      onClick={() => {
                        if (currentSlide < questions.length - 1) {
                          setCurrentSlide(currentSlide + 1);
                          carouselRef.current.goToSlide(currentSlide + 1);
                        }
                      }}
                    >
                      <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
                  </div>}
                  renderDotsOutside={true}
                  customDot={<div className="w-2 h-2 mx-0.5 rounded-full bg-blue-200 hover:bg-blue-400 transition-all duration-300 hover:scale-125" />}
                  dotListClass="flex justify-center mt-4"
                  afterChange={(previousSlide, currentSlide) => {
                    setCurrentSlide(currentSlide);
                  }}
                >
                  {questions.map((q, index) => (
                    <div key={index} className="p-3 bg-white rounded-lg shadow-md text-center transform transition-all duration-300 hover:shadow-lg hover:scale-[1.02]">
                      <div className="mb-3">
                        <p className="text-sm text-gray-800 mb-3">{q.question}</p>
                        
                        <div className="space-y-1.5 max-w-xs mx-auto">
                          {q.options.map((option, optIndex) => {
                            const isSelected = selectedAnswers[index] === option;
                            const isAnswered = selectedAnswers[index] !== undefined;
                            const isCorrectAnswer = isAnswered && option === q.correctAnswer;
                            
                            let optionClasses = "p-2.5 rounded-lg cursor-pointer transition-all duration-300 text-sm text-center transform hover:scale-102 border";
                            if (isAnswered) {
                              if (isCorrectAnswer) {
                                optionClasses += " bg-green-50 text-green-800 border-green-300";
                              } else if (isSelected) {
                                optionClasses += " bg-red-50 text-red-800 border-red-300";
                              } else {
                                optionClasses += " bg-gray-50 text-gray-700 border-gray-200";
                              }
                            } else {
                              optionClasses += isSelected 
                                ? " bg-blue-50 text-blue-800 border-blue-300" 
                                : " bg-gray-50 hover:bg-gray-100 text-gray-700 border-gray-200 hover:border-blue-300";
                            }

                            return (
                              <div
                                key={optIndex}
                                className={optionClasses}
                                onClick={() => !isAnswered && handleAnswerSelect(index, option)}
                              >
                                {option}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  ))}
                </Carousel>

                {Object.keys(selectedAnswers).length === questions.length && (
                  <div className="text-center space-y-4 mt-8 animate-fade-in">
                    <div className="bg-gradient-to-r from-blue-50 to-purple-50 p-4 rounded-lg shadow-md">
                      <p className="text-xl font-semibold text-gray-800">
                        Your Score: <span className="text-blue-600">{score}</span> out of <span className="text-blue-600">{questions.length}</span>
                      </p>
                      <p className="text-gray-600 mt-2 text-sm">
                        {score === questions.length ? 'Perfect! 🎉' : 
                         score >= questions.length * 0.7 ? 'Great job! 👏' : 
                         'Keep practicing! 💪'}
                      </p>
                    </div>

                    {score < questions.length && (
                      <div className="space-y-4">
                        <button
                          onClick={() => setCurrentPage('explanation')}
                          className="px-4 py-2 rounded-lg font-semibold text-white bg-gradient-to-r from-blue-600 to-purple-600 hover:shadow-lg transition-all duration-300 transform hover:scale-105"
                        >
                          View Explanations
                        </button>

                        <div className="flex justify-center space-x-4">
                          <button
                            onClick={handleSaveQuiz}
                            className="px-6 py-3 rounded-lg font-semibold text-white bg-gradient-to-r from-green-600 to-emerald-600 hover:shadow-lg transition-all duration-300 transform hover:scale-105"
                          >
                            Save Quiz
                          </button>
                          <button
                            onClick={resetQuiz}
                            className="px-6 py-3 rounded-lg font-semibold text-white bg-gradient-to-r from-blue-600 to-purple-600 hover:shadow-lg transition-all duration-300 transform hover:scale-105"
                          >
                            Try Again
                          </button>
                          <label className="px-6 py-3 rounded-lg font-semibold text-white bg-gradient-to-r from-indigo-600 to-violet-600 hover:shadow-lg transition-all duration-300 transform hover:scale-105 cursor-pointer">
                            Upload New PDF
                            <input
                              type="file"
                              accept=".pdf"
                              onChange={(e) => {
                                const selectedFile = e.target.files[0];
                                if (selectedFile && selectedFile.type === 'application/pdf') {
                                  setFile(selectedFile);
                                  setQuestions([]);
                                  setSelectedAnswers({});
                                  setScore(0);
                                  setError(null);
                                  setExplanations({});
                                  setShowExplanation(false);
                                } else {
                                  setError('Please select a valid PDF file');
                                  setFile(null);
                                }
                              }}
                              className="hidden"
                            />
                          </label>
                          <button
                            onClick={clearAll}
                            className="px-6 py-3 rounded-lg font-semibold text-white bg-gradient-to-r from-red-600 to-pink-600 hover:shadow-lg transition-all duration-300 transform hover:scale-105"
                          >
                            Clear All
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">Saved Quizzes</h3>
            {pdfList.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-gray-500">No saved quizzes yet</p>
              </div>
            ) : (
              <div className="space-y-2">
                {pdfList.map((pdfItem) => (
                  <div
                    key={pdfItem.id}
                    className="bg-white p-3 rounded-lg shadow-sm hover:shadow-md transition-all duration-300 flex items-center justify-between group"
                  >
                    <div className="flex items-center space-x-3">
                      <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      <div className="text-left">
                        <p className="text-sm font-medium text-gray-800">{pdfItem.name}</p>
                        <p className="text-xs text-gray-500">
                          {pdfItem.date} • Score: {pdfItem.score}/{pdfItem.totalQuestions}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => handlePdfSelect(pdfItem)}
                        className="p-1.5 rounded-full bg-blue-50 hover:bg-blue-100 text-blue-600 transition-all duration-300 hover:shadow-md hover:scale-105"
                        title="Try Again"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                      </button>
                      <button
                        onClick={() => handleDeletePdf(pdfItem.id)}
                        className="p-1.5 rounded-full bg-red-50 hover:bg-red-100 text-red-600 transition-all duration-300 hover:shadow-md hover:scale-105 opacity-0 group-hover:opacity-100"
                        title="Delete Quiz"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default PdfQuestionWidget; 
