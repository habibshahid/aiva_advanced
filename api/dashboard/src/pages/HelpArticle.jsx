/**
 * Help Article Component
 * Displays detailed help content for specific topics
 */

import React, { useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, 
  BookOpen, 
  Clock,
  Tag,
  PlayCircle,
  CheckCircle,
  AlertCircle,
  Info
} from 'lucide-react';
import { helpContent } from '../data/helpContent';

const HelpArticle = () => {
  const { articleId } = useParams();
  const navigate = useNavigate();
  const article = helpContent[articleId];

  useEffect(() => {
    // Scroll to top when article loads
    window.scrollTo(0, 0);
  }, [articleId]);

  if (!article) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-lg shadow p-12 text-center">
          <AlertCircle className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Article Not Found</h1>
          <p className="text-gray-600 mb-6">
            The help article you're looking for doesn't exist.
          </p>
          <Link
            to="/help"
            className="inline-flex items-center px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Help Center
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      {/* Breadcrumb */}
      <nav className="mb-6">
        <Link
          to="/help"
          className="inline-flex items-center text-primary-600 hover:text-primary-700"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Help Center
        </Link>
      </nav>

      {/* Article Header */}
      <div className="bg-white rounded-lg shadow-lg overflow-hidden mb-6">
        <div className="bg-gradient-to-r from-primary-600 to-primary-700 p-8 text-white">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              {article.category && (
                <div className="mb-3">
                  <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-white bg-opacity-20 text-white">
                    {article.category}
                  </span>
                </div>
              )}
              <h1 className="text-3xl font-bold mb-3">{article.title}</h1>
              <p className="text-primary-100 text-lg">{article.description}</p>
              
              {/* Meta information */}
              <div className="flex items-center mt-4 space-x-4 text-sm text-primary-100">
                {article.readTime && (
                  <div className="flex items-center">
                    <Clock className="w-4 h-4 mr-1" />
                    {article.readTime}
                  </div>
                )}
                {article.difficulty && (
                  <div className="flex items-center">
                    <Tag className="w-4 h-4 mr-1" />
                    {article.difficulty}
                  </div>
                )}
              </div>
            </div>
            <BookOpen className="w-12 h-12 text-primary-200 flex-shrink-0 ml-6" />
          </div>
        </div>

        {/* Video Tutorial (if available) */}
        {article.videoUrl && (
          <div className="p-6 bg-gray-50 border-b">
            <div className="flex items-center mb-3">
              <PlayCircle className="w-5 h-5 text-primary-600 mr-2" />
              <h3 className="font-semibold text-gray-900">Video Tutorial</h3>
            </div>
            <div className="aspect-video bg-gray-900 rounded-lg overflow-hidden">
              <iframe
                src={article.videoUrl}
                className="w-full h-full"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              ></iframe>
            </div>
          </div>
        )}

        {/* Table of Contents */}
        {article.sections && article.sections.length > 0 && (
          <div className="p-6 bg-blue-50 border-b">
            <h3 className="font-semibold text-gray-900 mb-3">In This Article</h3>
            <nav className="space-y-2">
              {article.sections.map((section, index) => (
                <a
                  key={index}
                  href={`#section-${index}`}
                  className="block text-primary-600 hover:text-primary-700 text-sm"
                >
                  {index + 1}. {section.title}
                </a>
              ))}
            </nav>
          </div>
        )}

        {/* Article Content */}
        <div className="p-8">
          <div className="prose prose-primary max-w-none">
            {/* Render sections */}
            {article.sections?.map((section, index) => (
              <div key={index} id={`section-${index}`} className="mb-8">
                <h2 className="text-2xl font-bold text-gray-900 mb-4">
                  {section.title}
                </h2>
                <div 
                  className="text-gray-700 leading-relaxed"
                  dangerouslySetInnerHTML={{ __html: section.content }}
                />
                
                {/* Steps */}
                {section.steps && (
                  <div className="mt-6 space-y-4">
                    {section.steps.map((step, stepIndex) => (
                      <div key={stepIndex} className="flex items-start">
                        <div className="flex-shrink-0 w-8 h-8 bg-primary-600 text-white rounded-full flex items-center justify-center font-semibold mr-4">
                          {stepIndex + 1}
                        </div>
                        <div className="flex-1">
                          <h4 className="font-medium text-gray-900 mb-1">{step.title}</h4>
                          <p className="text-gray-600">{step.description}</p>
                          {step.image && (
                            <img
                              src={step.image}
                              alt={step.title}
                              className="mt-3 rounded-lg border shadow-sm"
                            />
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Code blocks */}
                {section.code && (
                  <div className="mt-4">
                    <pre className="bg-gray-900 text-gray-100 p-4 rounded-lg overflow-x-auto">
                      <code>{section.code}</code>
                    </pre>
                  </div>
                )}

                {/* Tips */}
                {section.tips && (
                  <div className="mt-6 bg-blue-50 border-l-4 border-blue-500 p-4 rounded-r-lg">
                    <div className="flex items-start">
                      <Info className="w-5 h-5 text-blue-600 mr-3 flex-shrink-0 mt-0.5" />
                      <div>
                        <h5 className="font-medium text-blue-900 mb-2">💡 Tip</h5>
                        <p className="text-blue-800">{section.tips}</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Warnings */}
                {section.warning && (
                  <div className="mt-6 bg-yellow-50 border-l-4 border-yellow-500 p-4 rounded-r-lg">
                    <div className="flex items-start">
                      <AlertCircle className="w-5 h-5 text-yellow-600 mr-3 flex-shrink-0 mt-0.5" />
                      <div>
                        <h5 className="font-medium text-yellow-900 mb-2">⚠️ Warning</h5>
                        <p className="text-yellow-800">{section.warning}</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}

            {/* Next Steps */}
            {article.nextSteps && (
              <div className="mt-8 p-6 bg-green-50 rounded-lg border border-green-200">
                <div className="flex items-start">
                  <CheckCircle className="w-6 h-6 text-green-600 mr-3 flex-shrink-0 mt-0.5" />
                  <div>
                    <h3 className="text-lg font-semibold text-green-900 mb-3">
                      🎉 Next Steps
                    </h3>
                    <ul className="space-y-2">
                      {article.nextSteps.map((step, index) => (
                        <li key={index} className="flex items-start">
                          <span className="text-green-600 mr-2">→</span>
                          {step.link ? (
                            <Link
                              to={step.link}
                              className="text-green-700 hover:text-green-800 font-medium"
                            >
                              {step.text}
                            </Link>
                          ) : (
                            <span className="text-green-800">{step.text}</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Related Articles */}
        {article.relatedArticles && article.relatedArticles.length > 0 && (
          <div className="p-6 bg-gray-50 border-t">
            <h3 className="font-semibold text-gray-900 mb-4">Related Articles</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {article.relatedArticles.map((relatedId) => {
                const related = helpContent[relatedId];
                if (!related) return null;
                return (
                  <Link
                    key={relatedId}
                    to={`/help/${relatedId}`}
                    className="p-4 bg-white rounded-lg border hover:border-primary-500 hover:shadow transition-all"
                  >
                    <h4 className="font-medium text-gray-900 mb-1">{related.title}</h4>
                    <p className="text-sm text-gray-600">{related.description}</p>
                  </Link>
                );
              })}
            </div>
          </div>
        )}

        {/* Feedback */}
        <div className="p-6 bg-gray-100 border-t">
          <div className="text-center">
            <h3 className="font-medium text-gray-900 mb-3">Was this article helpful?</h3>
            <div className="flex items-center justify-center space-x-4">
              <button className="px-6 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors">
                👍 Yes
              </button>
              <button className="px-6 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors">
                👎 No
              </button>
            </div>
            <p className="text-sm text-gray-500 mt-4">
              Your feedback helps us improve our documentation
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default HelpArticle;
