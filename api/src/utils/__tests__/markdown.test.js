const markdown = require('../markdown');

console.log('🧪 Testing Markdown Utility\n');
console.log('='.repeat(60));

// Test 1: Bold and Italic
console.log('\n✨ Test 1: Bold and Italic');
const test1 = 'This is **bold** and this is *italic* text';
const result1 = markdown.markdownToHtml(test1);
console.log('Input:', test1);
console.log('Output:', result1);
console.assert(result1.includes('<strong>bold</strong>'), 'Bold conversion failed');
console.assert(result1.includes('<em>italic</em>'), 'Italic conversion failed');
console.log('✅ Bold and italic work!');

// Test 2: Links
console.log('\n🔗 Test 2: Links');
const test2 = 'Visit [Google](https://google.com) for search';
const result2 = markdown.markdownToHtml(test2);
console.log('Input:', test2);
console.log('Output:', result2);
console.assert(result2.includes('<a href="https://google.com"'), 'Link conversion failed');
console.log('✅ Links work!');

// Test 3: Code blocks
console.log('\n💻 Test 3: Code Blocks');
const test3 = 'Inline `code` and\n```javascript\nconst x = 1;\n```';
const result3 = markdown.markdownToHtml(test3);
console.log('Input:', test3);
console.log('Output:', result3);
console.assert(result3.includes('<code>code</code>'), 'Inline code failed');
console.assert(result3.includes('<pre><code'), 'Code block failed');
console.log('✅ Code blocks work!');

// Test 4: Headers
console.log('\n📑 Test 4: Headers');
const test4 = '# H1\n## H2\n### H3';
const result4 = markdown.markdownToHtml(test4);
console.log('Input:', test4);
console.log('Output:', result4);
console.assert(result4.includes('<h1>H1</h1>'), 'H1 failed');
console.assert(result4.includes('<h2>H2</h2>'), 'H2 failed');
console.assert(result4.includes('<h3>H3</h3>'), 'H3 failed');
console.log('✅ Headers work!');

// Test 5: Format Response
console.log('\n📋 Test 5: Format Response (all formats)');
const test5 = '**Bold** text with *italic*';
const result5 = markdown.formatResponse(test5);
console.log('Input:', test5);
console.log('Text:', result5.text);
console.log('HTML:', result5.html);
console.log('Markdown:', result5.markdown);
console.assert(result5.text, 'Text conversion failed');
console.assert(result5.html, 'HTML conversion failed');
console.assert(result5.markdown, 'Markdown failed');
console.log('✅ Format response works!');

// Test 6: Sanitize HTML
console.log('\n🔒 Test 6: Sanitize HTML');
const test6 = '<script>alert("xss")</script><p>Safe</p>';
const result6 = markdown.sanitizeHtml(test6);
console.log('Input:', test6);
console.log('Output:', result6);
console.assert(!result6.includes('<script>'), 'Script not removed');
console.assert(result6.includes('<p>Safe</p>'), 'Safe content removed');
console.log('✅ HTML sanitization works!');

// Test 7: Strip Markdown
console.log('\n🔍 Test 7: Strip Markdown');
const test7 = '## Title\n\n**Bold** [link](url)';
const result7 = markdown.stripMarkdown(test7);
console.log('Input:', test7);
console.log('Output:', result7);
console.assert(!result7.includes('**'), 'Bold markers not removed');
console.assert(!result7.includes('['), 'Link markers not removed');
console.log('✅ Strip markdown works!');

// Test 8: Truncate
console.log('\n✂️ Test 8: Truncate Text');
const test8 = 'This is a very long text that needs truncation';
const result8 = markdown.truncateText(test8, 20);
console.log('Input:', test8);
console.log('Output:', result8);
console.assert(result8.length <= 23, 'Truncation failed'); // 20 + '...'
console.log('✅ Truncation works!');

// Test 9: HTML to Text
console.log('\n📄 Test 9: HTML to Text');
const test9 = '<h1>Title</h1><p>Text with <strong>bold</strong></p>';
const result9 = markdown.htmlToText(test9);
console.log('Input:', test9);
console.log('Output:', result9);
console.assert(!result9.includes('<'), 'HTML tags not removed');
console.assert(result9.includes('Title'), 'Content lost');
console.log('✅ HTML to text works!');

// Test 10: Linkify URLs
console.log('\n🌐 Test 10: Linkify URLs');
const test10 = 'Visit https://example.com for info';
const result10 = markdown.linkifyUrls(test10);
console.log('Input:', test10);
console.log('Output:', result10);
console.assert(result10.includes('<a href='), 'URL not linkified');
console.log('✅ Linkify works!');

console.log('\n' + '='.repeat(60));
console.log('🎉 All markdown tests passed!');
console.log('='.repeat(60));