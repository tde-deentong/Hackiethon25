import React, { useState } from 'react';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { GlobalWorkerOptions } from 'pdfjs-dist/legacy/build/pdf.mjs';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import Carousel from 'react-multi-carousel';

GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/legacy/build/pdf.worker.min.mjs', import.meta.url).toString();

const PdfQuestionWidget = () => {
  const [file, setFile] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedAnswers, setSelectedAnswers] = useState({});
  const [score, setScore] = useState(0);

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
      <div className="p-4 bg-white rounded-lg shadow-md">
        <div className="mb-4">
          <p className="text-base text-gray-700 mb-4">{question.question}</p>
          
          <div className="space-y-2">
            {question.options.map((option, optIndex) => {
              const isSelected = selectedAnswers[index] === option;
              const isCorrectAnswer = isAnswered && option === question.correctAnswer;
              
              let optionClasses = "p-2 rounded-lg cursor-pointer transition-colors text-sm";
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

          {/* {isAnswered && (
            <div className="mt-3">
              {isCorrect ? (
                <p className="text-green-600 font-medium text-sm">Correct!</p>
              ) : (
                <p className="text-red-600 font-medium text-sm">
                  Incorrect. The correct answer is: {question.correctAnswer}
                </p>
              )}
            </div>
          )} */}
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
    <div className="p-4 max-w-xl mx-auto bg-white rounded-xl shadow-lg">
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <h2 className="text-xl font-bold text-gray-800">PDF Question Generator</h2>
          {questions.length > 0 && (
            <button
              onClick={clearAll}
              className="p-2 rounded-full bg-red-50 hover:bg-red-100 text-red-600 transition-colors"
              title="Clear all"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          )}
        </div>
        
        <div className="space-y-3">
          <div className="flex flex-col items-center space-y-2">
            <input
              type="file"
              accept=".pdf"
              onChange={handleFileChange}
              className="block w-full text-sm text-gray-500
                file:mr-4 file:py-2 file:px-4
                file:rounded-full file:border-0
                file:text-sm file:font-semibold
                file:bg-blue-50 file:text-blue-700
                hover:file:bg-blue-100"
            />
            {error && <p className="text-red-500 text-sm">{error}</p>}
          </div>

          <div className="flex justify-center">
            <button
              onClick={generateQuestions}
              disabled={loading || !file}
              className={`px-4 py-2 rounded-lg font-semibold text-white
                ${loading || !file 
                  ? 'bg-gray-400 cursor-not-allowed' 
                  : 'bg-blue-600 hover:bg-blue-700'}`}
            >
              {loading ? 'Generating Questions...' : 'Generate Questions'}
            </button>
          </div>

          {questions.length > 0 && (
            <div className="space-y-4">
              <Carousel
                responsive={carouselResponsive}
                infinite={false}
                containerClass="pb-2"
                itemClass="px-2"
                customButtonGroup={<div className="flex justify-center space-x-2 mt-4">
                  <button className="p-2 rounded-full bg-gray-100 hover:bg-gray-200 transition-colors">
                    <svg className="w-6 h-6 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                  </button>
                  <button className="p-2 rounded-full bg-gray-100 hover:bg-gray-200 transition-colors">
                    <svg className="w-6 h-6 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                </div>}
                renderDotsOutside={true}
                customDot={<div className="w-2 h-2 mx-1 rounded-full bg-gray-300 hover:bg-gray-400 transition-colors" />}
                dotListClass="flex justify-center mt-4"
              >
                {questions.map((q, index) => renderQuestion(q, index))}
              </Carousel>

              {Object.keys(selectedAnswers).length === questions.length && (
                <div className="text-center space-y-3">
                  <div className="flex justify-center space-x-4">
                    <button
                      onClick={resetQuiz}
                      className="px-4 py-2 rounded-lg font-semibold text-white bg-blue-600 hover:bg-blue-700"
                    >
                      Try Again
                    </button>
                    <button
                      onClick={clearAll}
                      className="px-4 py-2 rounded-lg font-semibold text-white bg-red-600 hover:bg-red-700"
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
