import React, { useState, useCallback } from 'react';
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

  const handleAnswerSelect = (questionIndex, answer) => {
    if (selectedAnswers[questionIndex] !== undefined) return; // Prevent changing answer after selection
    
    setSelectedAnswers(prev => ({
      ...prev,
      [questionIndex]: answer
    }));

    // Update score immediately
    const isCorrect = answer === questions[questionIndex].correctAnswer;
    setScore(prev => isCorrect ? prev + 1 : prev);
  };

  const resetQuiz = () => {
    setSelectedAnswers({});
    setScore(0);
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

  const clearAll = () => {
    setFile(null);
    setQuestions([]);
    setSelectedAnswers({});
    setScore(0);
    setError(null);
  };

  return (
    <div className="p-6 max-w-2xl mx-auto bg-gradient-to-br from-white to-blue-50 rounded-2xl shadow-xl text-center border border-blue-100">
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h2 className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-purple-600">PDF Question Generator</h2>
          {questions.length > 0 && (
            <button
              onClick={clearAll}
              className="p-2.5 rounded-full bg-red-50 hover:bg-red-100 text-red-600 transition-all duration-300 hover:shadow-md"
              title="Clear all"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          )}
        </div>
        
        <div className="space-y-4">
          <div 
            className={`relative border-3 border-dashed rounded-xl transition-all duration-300 ease-in-out
              ${questions.length > 0 ? 'p-4' : 'p-10'}
              ${isDragging ? 'border-blue-500 bg-blue-50 shadow-lg scale-102' : 'border-blue-200 hover:border-blue-400 hover:shadow-md'}
              ${file ? 'border-green-500 bg-green-50' : ''}`}
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
          >
            <div className="text-center">
              <svg className={`mx-auto transition-all duration-300 text-blue-400 ${questions.length > 0 ? 'h-8 w-8' : 'h-16 w-16'}`} stroke="currentColor" fill="none" viewBox="0 0 48 48">
                <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <p className={`transition-all duration-300 ${questions.length > 0 ? 'mt-2 text-sm' : 'mt-4 text-base'} text-gray-600`}>
                {file ? (
                  <span className="text-green-600 font-medium text-lg">{file.name}</span>
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
              {!questions.length > 0 && <p className="mt-2 text-sm text-gray-500">PDF files only</p>}
            </div>
          </div>
          {error && (
            <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded-md">
              <p className="text-red-700 text-sm">{error}</p>
            </div>
          )}

          <div className="flex justify-center pt-2">
            <button
              onClick={generateQuestions}
              disabled={loading || !file}
              className={`px-6 py-3 rounded-lg font-semibold text-white text-center transition-all duration-300 transform hover:scale-105
                ${loading || !file 
                  ? 'bg-gray-400 cursor-not-allowed' 
                  : 'bg-gradient-to-r from-blue-600 to-purple-600 hover:shadow-lg'}`}
            >
              {loading ? (
                <span className="flex items-center">
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Generating Questions...
                </span>
              ) : 'Generate Questions'}
            </button>
          </div>

          {questions.length > 0 && (
            <div className="space-y-6 mt-8">
              <Carousel
                responsive={carouselResponsive}
                infinite={false}
                containerClass="pb-4"
                itemClass="px-4"
                customButtonGroup={<div className="flex justify-center space-x-4 mt-6">
                  <button className="p-3 rounded-full bg-white hover:bg-gray-100 transition-colors shadow-md">
                    <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                  </button>
                  <button className="p-3 rounded-full bg-white hover:bg-gray-100 transition-colors shadow-md">
                    <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                </div>}
                renderDotsOutside={true}
                customDot={<div className="w-3 h-3 mx-1 rounded-full bg-blue-200 hover:bg-blue-400 transition-colors" />}
                dotListClass="flex justify-center mt-6"
              >
                {questions.map((q, index) => (
                  <div key={index} className="p-6 bg-white rounded-xl shadow-lg text-center transform transition-all duration-300 hover:shadow-xl">
                    <div className="mb-6">
                      <p className="text-lg text-gray-800 mb-6">{q.question}</p>
                      
                      <div className="space-y-3 max-w-md mx-auto">
                        {q.options.map((option, optIndex) => {
                          const isSelected = selectedAnswers[index] === option;
                          const isAnswered = selectedAnswers[index] !== undefined;
                          const isCorrectAnswer = isAnswered && option === q.correctAnswer;
                          
                          let optionClasses = "p-4 rounded-lg cursor-pointer transition-all duration-300 text-base text-center transform hover:scale-102";
                          if (isAnswered) {
                            if (isCorrectAnswer) {
                              optionClasses += " bg-green-100 text-green-800 border-2 border-green-500";
                            } else if (isSelected) {
                              optionClasses += " bg-red-100 text-red-800 border-2 border-red-500";
                            } else {
                              optionClasses += " bg-gray-50 text-gray-700";
                            }
                          } else {
                            optionClasses += isSelected 
                              ? " bg-blue-100 text-blue-800 border-2 border-blue-500" 
                              : " bg-gray-50 hover:bg-gray-100 text-gray-700 border-2 border-transparent hover:border-blue-300";
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
                <div className="text-center space-y-4 mt-8">
                  <p className="text-xl font-semibold text-gray-800">
                    Your Score: <span className="text-blue-600">{score}</span> out of <span className="text-blue-600">{questions.length}</span>
                  </p>
                  <div className="flex justify-center space-x-4">
                    <button
                      onClick={resetQuiz}
                      className="px-6 py-3 rounded-lg font-semibold text-white bg-gradient-to-r from-blue-600 to-purple-600 hover:shadow-lg transition-all duration-300 transform hover:scale-105"
                    >
                      Try Again
                    </button>
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
      </div>
    </div>
  );
};

export default PdfQuestionWidget; 
