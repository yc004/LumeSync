# 萤火课件示例集合

本文档提供各类课件的完整示例代码，供学习和参考。

---

## 基础示例

### 1. 简单文本幻灯片

```javascript
function SimpleTextSlide() {
  return (
    <div className="p-12 text-center">
      <h1 className="text-5xl font-bold text-blue-600 mb-6">
        欢迎使用萤火课件
      </h1>
      <p className="text-2xl text-gray-700">
        这是一个简单的文本幻灯片示例
      </p>
    </div>
  );
}

window.CourseData = {
  id: 'simple-text',
  title: '简单文本',
  slides: [
    { component: <SimpleTextSlide /> }
  ]
};
```

### 2. 图片展示

```javascript
function ImageSlide() {
  return (
    <div className="p-8 bg-white rounded-lg shadow-lg">
      <h2 className="text-3xl font-bold mb-6 text-center">
        产品展示
      </h2>
      <div className="flex justify-center">
        <img 
          src="https://via.placeholder.com/400x300" 
          alt="产品图片"
          className="rounded-lg shadow-md max-w-full"
        />
      </div>
      <p className="mt-6 text-center text-gray-600">
        这是我们的产品展示图片
      </p>
    </div>
  );
}

window.CourseData = {
  id: 'image-showcase',
  title: '图片展示',
  slides: [
    { component: <ImageSlide /> }
  ]
};
```

---

## 教学科目示例

### 3. 数学：加法练习

```javascript
import { useState } from 'react';

function MathAdditionQuiz() {
  const [score, setScore] = useState(0);
  const [feedback, setFeedback] = useState(null);
  
  const checkAnswer = (isCorrect) => {
    if (isCorrect) {
      setScore(score + 10);
      setFeedback({ type: 'success', message: '正确！' });
    } else {
      setFeedback({ type: 'error', message: '再想想...' });
    }
  };
  
  return (
    <div className="p-12 bg-blue-50 rounded-xl">
      <h2 className="text-4xl font-bold text-center mb-8">
        加法练习：3 + 5 = ?
      </h2>
      
      <div className="flex justify-center gap-8">
        <button 
          onClick={() => checkAnswer(false)}
          className="w-32 h-32 bg-white rounded-xl shadow-md text-3xl font-bold hover:bg-blue-100 transition-colors"
        >
          7
        </button>
        <button 
          onClick={() => checkAnswer(true)}
          className="w-32 h-32 bg-green-500 text-white rounded-xl shadow-md text-3xl font-bold hover:bg-green-600 transition-colors"
        >
          8
        </button>
        <button 
          onClick={() => checkAnswer(false)}
          className="w-32 h-32 bg-white rounded-xl shadow-md text-3xl font-bold hover:bg-blue-100 transition-colors"
        >
          9
        </button>
      </div>
      
      {feedback && (
        <div className={`mt-8 text-center text-2xl font-bold ${
          feedback.type === 'success' ? 'text-green-600' : 'text-red-600'
        }`}>
          {feedback.message}
        </div>
      )}
      
      <div className="mt-8 text-center text-xl text-gray-700">
        得分：{score}
      </div>
    </div>
  );
}

window.CourseData = {
  id: 'math-addition',
  title: '数学加法练习',
  description: '10以内加法练习',
  slides: [
    { component: <MathAdditionQuiz /> }
  ]
};
```

### 4. 语文：识字卡片

```javascript
function VocabularyCard() {
  const [showPinyin, setShowPinyin] = useState(false);
  const [showMeaning, setShowMeaning] = useState(false);
  
  return (
    <div className="p-12 bg-gradient-to-br from-pink-100 to-purple-100 rounded-2xl">
      <h2 className="text-3xl font-bold text-center mb-8 text-purple-800">
        识字卡片
      </h2>
      
      <div className="flex justify-center mb-8">
        <div className="bg-white rounded-2xl shadow-lg p-12">
          <div className="text-9xl font-bold text-pink-600 text-center">
            天
          </div>
        </div>
      </div>
      
      <div className="text-center space-y-4">
        <button 
          onClick={() => setShowPinyin(!showPinyin)}
          className="px-8 py-3 bg-purple-500 text-white rounded-lg text-xl hover:bg-purple-600 transition-colors"
        >
          {showPinyin ? '隐藏拼音' : '显示拼音'}
        </button>
        
        {showPinyin && (
          <div className="text-4xl text-purple-700 font-semibold animate-fadeIn">
            tiān
          </div>
        )}
        
        <button 
          onClick={() => setShowMeaning(!showMeaning)}
          className="px-8 py-3 bg-pink-500 text-white rounded-lg text-xl hover:bg-pink-600 transition-colors"
        >
          {showMeaning ? '隐藏释义' : '显示释义'}
        </button>
        
        {showMeaning && (
          <div className="text-2xl text-gray-700 animate-fadeIn">
            天空、日子、天气
          </div>
        )}
      </div>
    </div>
  );
}

window.CourseData = {
  id: 'chinese-vocabulary',
  title: '识字卡片：汉字',
  slides: [
    { component: <VocabularyCard /> }
  ]
};
```

### 5. 英语：单词配对游戏

```javascript
import { useState } from 'react';

function EnglishMatchingGame() {
  const [score, setScore] = useState(0);
  const [matches, setMatches] = useState([]);
  
  const words = [
    { id: 'apple', word: 'Apple', emoji: '🍎', translation: '苹果' },
    { id: 'banana', word: 'Banana', emoji: '🍌', translation: '香蕉' },
    { id: 'orange', word: 'Orange', emoji: '🍊', translation: '橘子' },
    { id: 'grape', word: 'Grape', emoji: '🍇', translation: '葡萄' }
  ];
  
  const handleMatch = (wordId) => {
    if (!matches.includes(wordId)) {
      setMatches([...matches, wordId]);
      setScore(score + 1);
    }
  };
  
  return (
    <div className="p-8 bg-yellow-50 rounded-xl">
      <h2 className="text-3xl font-bold text-center mb-6 text-yellow-800">
        英语单词配对
      </h2>
      <p className="text-center text-gray-600 mb-8">
        点击正确的中文释义
      </p>
      
      <div className="grid grid-cols-2 gap-6 max-w-3xl mx-auto">
        {words.map((item) => (
          <div 
            key={item.id}
            className={`bg-white rounded-xl shadow-md p-6 ${
              matches.includes(item.id) ? 'ring-4 ring-green-500' : ''
            }`}
          >
            <div className="text-center">
              <div className="text-6xl mb-4">{item.emoji}</div>
              <div className="text-3xl font-bold text-blue-600 mb-4">
                {item.word}
              </div>
              <button 
                onClick={() => handleMatch(item.id)}
                disabled={matches.includes(item.id)}
                className={`w-full px-4 py-2 rounded-lg text-xl font-semibold transition-colors ${
                  matches.includes(item.id)
                    ? 'bg-green-500 text-white cursor-not-allowed'
                    : 'bg-yellow-500 text-white hover:bg-yellow-600'
                }`}
              >
                {item.translation}
              </button>
            </div>
          </div>
        ))}
      </div>
      
      <div className="mt-8 text-center">
        <div className="text-2xl font-bold text-gray-700">
          配对成功：{score} / {words.length}
        </div>
      </div>
    </div>
  );
}

window.CourseData = {
  id: 'english-matching',
  title: '英语单词配对',
  slides: [
    { component: <EnglishMatchingGame /> }
  ]
};
```

### 6. 科学：植物生长排序

```javascript
import { useState } from 'react';

function PlantGrowthOrdering() {
  const [order, setOrder] = useState([
    { id: 'seed', emoji: '🌱', label: '种子' },
    { id: 'sprout', emoji: '🌿', label: '发芽' },
    { id: 'flower', emoji: '🌸', label: '开花' },
    { id: 'fruit', emoji: '🍎', label: '结果' }
  ]);
  const [feedback, setFeedback] = useState(null);
  
  const correctOrder = ['seed', 'sprout', 'flower', 'fruit'];
  
  const checkOrder = () => {
    const currentIds = order.map(item => item.id);
    const isCorrect = JSON.stringify(currentIds) === JSON.stringify(correctOrder);
    
    setFeedback({
      type: isCorrect ? 'success' : 'error',
      message: isCorrect ? '太棒了！顺序正确' : '顺序不对，再试试吧'
    });
  };
  
  const moveItem = (fromIndex, toIndex) => {
    const newOrder = [...order];
    const [removed] = newOrder.splice(fromIndex, 1);
    newOrder.splice(toIndex, 0, removed);
    setOrder(newOrder);
  };
  
  return (
    <div className="p-8 bg-green-50 rounded-xl">
      <h2 className="text-3xl font-bold text-center mb-4 text-green-800">
        植物生长顺序
      </h2>
      <p className="text-center text-gray-600 mb-8">
        拖拽图片，按正确顺序排列植物生长过程
      </p>
      
      <div className="flex justify-center gap-4 mb-8">
        {order.map((item, index) => (
          <div
            key={item.id}
            className="bg-white rounded-xl shadow-lg p-6 text-center cursor-move hover:shadow-xl transition-shadow"
          >
            <div className="text-6xl mb-2">{item.emoji}</div>
            <div className="text-xl font-semibold text-gray-700">
              {item.label}
            </div>
            <div className="text-sm text-gray-500 mt-2">
              第 {index + 1} 步
            </div>
          </div>
        ))}
      </div>
      
      <div className="text-center space-y-4">
        <button 
          onClick={checkOrder}
          className="px-8 py-3 bg-green-500 text-white rounded-lg text-xl font-bold hover:bg-green-600 transition-colors"
        >
          检查答案
        </button>
        
        {feedback && (
          <div className={`text-2xl font-bold ${
            feedback.type === 'success' ? 'text-green-600' : 'text-red-600'
          }`}>
            {feedback.message}
          </div>
        )}
      </div>
    </div>
  );
}

window.CourseData = {
  id: 'plant-growth',
  title: '植物生长过程',
  slides: [
    { component: <PlantGrowthOrdering /> }
  ]
};
```

---

## 使用内置组件的示例

### 7. 课程反馈问卷

```javascript
window.CourseData = {
  id: 'course-feedback',
  title: '课程反馈问卷',
  description: '学生课程反馈调查',
  slides: [
    {
      component: (
        <div className="p-12 text-center bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-2xl">
          <h1 className="text-5xl font-bold mb-6">课程反馈问卷</h1>
          <p className="text-2xl">感谢你的参与，请真实填写</p>
        </div>
      )
    },
    {
      component: (
        <SurveySlide
          config={{
            id: 'course-feedback-2024',
            title: '课程反馈问卷',
            description: '请真实填写，帮助我们改进课程质量。',
            required: true,
            showProgress: true,
            theme: {
              primary: 'blue',
              background: 'slate'
            },
            questions: [
              {
                id: 'q1',
                type: 'single',
                title: '你对这门课程的满意度如何？',
                required: true,
                options: [
                  { value: '5', label: '非常满意', icon: '⭐⭐⭐⭐⭐' },
                  { value: '4', label: '满意', icon: '⭐⭐⭐⭐' },
                  { value: '3', label: '一般', icon: '⭐⭐⭐' },
                  { value: '2', label: '不满意', icon: '⭐⭐' },
                  { value: '1', label: '非常不满意', icon: '⭐' }
                ]
              },
              {
                id: 'q2',
                type: 'multiple',
                title: '你对课程的哪些方面满意？',
                required: true,
                options: [
                  { value: 'content', label: '课程内容', icon: '📚' },
                  { value: 'teaching', label: '教学方式', icon: '👨‍🏫' },
                  { value: 'interaction', label: '互动体验', icon: '💬' },
                  { value: 'design', label: '界面设计', icon: '🎨' },
                  { value: 'speed', label: '加载速度', icon: '⚡' }
                ]
              },
              {
                id: 'q3',
                type: 'text',
                title: '请写下你的建议',
                description: '你的建议对我们很重要',
                required: false,
                maxLength: 500
              },
              {
                id: 'q4',
                type: 'rating',
                title: '请给教师评分',
                required: true,
                options: [
                  { value: 1, label: '非常差', icon: '😠' },
                  { value: 2, label: '较差', icon: '😞' },
                  { value: 3, label: '一般', icon: '😐' },
                  { value: 4, label: '良好', icon: '🙂' },
                  { value: 5, label: '优秀', icon: '😊' }
                ]
              },
              {
                id: 'q5',
                type: 'ranking',
                title: '请对以下资源排序',
                required: true,
                options: [
                  { value: 'video', label: '视频教程', icon: '🎬' },
                  { value: 'slides', label: '幻灯片', icon: '📊' },
                  { value: 'notes', label: '笔记文档', icon: '📝' },
                  { value: 'quiz', label: '测验题', icon: '❓' }
                ]
              }
            ]
          }}
        />
      )
    }
  ]
};
```

### 8. 嵌入外部网页

```javascript
window.CourseData = {
  id: 'embedded-webpage',
  title: '网页嵌入示例',
  slides: [
    {
      component: (
        <div className="p-8">
          <h1 className="text-3xl font-bold mb-6 text-center">
            外部资源推荐
          </h1>
          <WebPageSlide 
            url="https://example.com/docs"
            title="文档中心"
            openLabel="在新窗口打开"
          />
        </div>
      )
    }
  ]
};
```

---

## 综合应用示例

### 9. 完整课程：认识颜色

```javascript
import { useState } from 'react';

function ColorLessonPage1() {
  return (
    <div className="p-12 bg-gradient-to-br from-blue-400 to-purple-500 text-white rounded-2xl">
      <h1 className="text-5xl font-bold text-center mb-6">认识颜色</h1>
      <p className="text-2xl text-center">今天我们要学习三种基础颜色</p>
    </div>
  );
}

function ColorLessonPage2() {
  const [selectedColor, setSelectedColor] = useState(null);
  
  const colors = [
    { name: '红色', color: 'bg-red-500', english: 'Red' },
    { name: '黄色', color: 'bg-yellow-400', english: 'Yellow' },
    { name: '蓝色', color: 'bg-blue-500', english: 'Blue' }
  ];
  
  return (
    <div className="p-8">
      <h2 className="text-3xl font-bold text-center mb-8 text-gray-800">
        第一部分：认识颜色
      </h2>
      
      <div className="flex justify-center gap-8">
        {colors.map((c) => (
          <div
            key={c.name}
            onClick={() => setSelectedColor(c)}
            className={`${c.color} rounded-xl shadow-lg p-8 cursor-pointer transform hover:scale-105 transition-transform ${
              selectedColor?.name === c.name ? 'ring-4 ring-offset-4 ring-gray-800' : ''
            }`}
          >
            <div className="text-center">
              <div className="text-6xl font-bold text-white mb-2">
                {c.name}
              </div>
              <div className="text-2xl text-white font-semibold">
                {c.english}
              </div>
            </div>
          </div>
        ))}
      </div>
      
      {selectedColor && (
        <div className="mt-8 text-center">
          <p className="text-2xl text-gray-700">
            你选择了：<span className={`font-bold ${selectedColor.color} text-white px-4 py-1 rounded`}>
              {selectedColor.name}
            </span>
          </p>
        </div>
      )}
    </div>
  );
}

function ColorLessonPage3() {
  const [selectedAnswer, setSelectedAnswer] = useState(null);
  const [feedback, setFeedback] = useState(null);
  
  const checkAnswer = () => {
    if (selectedAnswer === 'green') {
      setFeedback({ type: 'success', message: '正确！这是绿色' });
    } else {
      setFeedback({ type: 'error', message: '不对哦，再想想' });
    }
  };
  
  return (
    <div className="p-8">
      <h2 className="text-3xl font-bold text-center mb-6 text-gray-800">
        第二部分：练习
      </h2>
      
      <div className="text-center mb-8">
        <p className="text-2xl mb-6">这是什么颜色？</p>
        <div className="inline-block bg-green-500 rounded-xl p-12 shadow-xl">
          <div className="text-6xl text-white">●</div>
        </div>
      </div>
      
      <div className="flex justify-center gap-6">
        {['red', 'yellow', 'green'].map((color) => (
          <button
            key={color}
            onClick={() => setSelectedAnswer(color)}
            className={`px-8 py-4 rounded-xl text-xl font-bold transition-colors ${
              selectedAnswer === color
                ? 'ring-4 ring-offset-2 ring-blue-500'
                : ''
            } ${
              color === 'red' ? 'bg-red-500 text-white hover:bg-red-600' :
              color === 'yellow' ? 'bg-yellow-400 text-gray-800 hover:bg-yellow-500' :
              'bg-green-500 text-white hover:bg-green-600'
            }`}
          >
            {color === 'red' ? '红色' : color === 'yellow' ? '黄色' : '绿色'}
          </button>
        ))}
      </div>
      
      <div className="text-center mt-8">
        <button
          onClick={checkAnswer}
          className="px-8 py-3 bg-blue-500 text-white rounded-xl text-xl font-bold hover:bg-blue-600 transition-colors"
        >
          检查答案
        </button>
        
        {feedback && (
          <div className={`mt-4 text-2xl font-bold ${
            feedback.type === 'success' ? 'text-green-600' : 'text-red-600'
          }`}>
            {feedback.message}
          </div>
        )}
      </div>
    </div>
  );
}

window.CourseData = {
  id: 'color-lesson',
  title: '认识颜色',
  description: '学习基础颜色名称和识别',
  targetAudience: '学前班',
  duration: '10分钟',
  slides: [
    { component: <ColorLessonPage1 /> },
    { component: <ColorLessonPage2 /> },
    { component: <ColorLessonPage3 /> }
  ]
};
```

### 10. 互动问答竞赛

```javascript
import { useState } from 'react';

function QuizCompetition() {
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [score, setScore] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState(null);
  const [showResult, setShowResult] = useState(false);
  const [quizComplete, setQuizComplete] = useState(false);
  
  const questions = [
    {
      id: 1,
      question: '中国的首都是哪个城市？',
      options: [
        { id: 'A', text: '上海', correct: false },
        { id: 'B', text: '北京', correct: true },
        { id: 'C', text: '广州', correct: false },
        { id: 'D', text: '深圳', correct: false }
      ]
    },
    {
      id: 2,
      question: '地球是行星吗？',
      options: [
        { id: 'A', text: '是', correct: true },
        { id: 'B', text: '不是', correct: false }
      ]
    },
    {
      id: 3,
      question: '1 + 1 = ?',
      options: [
        { id: 'A', text: '1', correct: false },
        { id: 'B', text: '2', correct: true },
        { id: 'C', text: '3', correct: false }
      ]
    }
  ];
  
  const handleAnswer = (option) => {
    setSelectedAnswer(option);
    setShowResult(true);
    
    if (option.correct) {
      setScore(score + 10);
    }
  };
  
  const handleNext = () => {
    if (currentQuestion < questions.length - 1) {
      setCurrentQuestion(currentQuestion + 1);
      setSelectedAnswer(null);
      setShowResult(false);
    } else {
      setQuizComplete(true);
    }
  };
  
  if (quizComplete) {
    return (
      <div className="p-12 bg-gradient-to-br from-yellow-400 to-orange-500 rounded-2xl text-white text-center">
        <h1 className="text-5xl font-bold mb-6">竞赛完成！</h1>
        <div className="text-6xl font-bold mb-6">{score} 分</div>
        <p className="text-2xl mb-8">
          {score === questions.length * 10 ? '太棒了！全部正确！' : '继续加油！'}
        </p>
        <button
          onClick={() => {
            setCurrentQuestion(0);
            setScore(0);
            setSelectedAnswer(null);
            setShowResult(false);
            setQuizComplete(false);
          }}
          className="px-8 py-4 bg-white text-orange-600 rounded-xl text-xl font-bold hover:bg-gray-100 transition-colors"
        >
          重新开始
        </button>
      </div>
    );
  }
  
  const q = questions[currentQuestion];
  
  return (
    <div className="p-8 bg-white rounded-xl shadow-lg">
      <div className="flex justify-between items-center mb-6">
        <div className="text-xl font-bold text-gray-700">
          第 {currentQuestion + 1} / {questions.length} 题
        </div>
        <div className="text-xl font-bold text-blue-600">
          得分：{score}
        </div>
      </div>
      
      <div className="mb-8">
        <h2 className="text-3xl font-bold text-center mb-8 text-gray-800">
          {q.question}
        </h2>
        
        <div className="grid grid-cols-2 gap-4">
          {q.options.map((option) => (
            <button
              key={option.id}
              onClick={() => !showResult && handleAnswer(option)}
              disabled={showResult}
              className={`p-6 rounded-xl text-xl font-bold transition-all ${
                showResult && option.id === selectedAnswer?.id
                  ? option.correct
                    ? 'bg-green-500 text-white ring-4 ring-green-300'
                    : 'bg-red-500 text-white ring-4 ring-red-300'
                  : showResult && option.correct
                  ? 'bg-green-200 text-green-800 ring-4 ring-green-300'
                  : 'bg-blue-100 text-blue-800 hover:bg-blue-200'
              }`}
            >
              {option.id}. {option.text}
            </button>
          ))}
        </div>
      </div>
      
      {showResult && (
        <div className="text-center">
          <div className={`text-2xl font-bold mb-4 ${
            selectedAnswer.correct ? 'text-green-600' : 'text-red-600'
          }`}>
            {selectedAnswer.correct ? '正确！' : '错误！'}
          </div>
          <button
            onClick={handleNext}
            className="px-8 py-3 bg-blue-500 text-white rounded-xl text-xl font-bold hover:bg-blue-600 transition-colors"
          >
            {currentQuestion < questions.length - 1 ? '下一题' : '查看结果'}
          </button>
        </div>
      )}
    </div>
  );
}

window.CourseData = {
  id: 'quiz-competition',
  title: '知识问答竞赛',
  slides: [
    { component: <QuizCompetition /> }
  ]
};
```

---

## 交互同步示例

### 7. 选择题同步（自动同步）

```javascript
function MultipleChoiceSlide() {
  // 使用自动同步 Hook
  const [selectedOption, setSelectedOption] = window.CourseGlobalContext.useSyncVar('quiz:option', null);

  const options = [
    { id: 'A', text: 'Python', correct: false },
    { id: 'B', text: 'JavaScript', correct: true },
    { id: 'C', text: 'Java', correct: false },
    { id: 'D', text: 'C++', correct: false }
  ];

  const handleOptionClick = (optionId) => {
    // 教师端设置值时，自动同步到所有学生端
    setSelectedOption(optionId);
  };

  return (
    <div className="p-12 bg-gradient-to-br from-purple-50 to-blue-50 rounded-xl">
      <h2 className="text-4xl font-bold text-center mb-8">
        哪种语言主要用于 Web 前端开发？
      </h2>

      <div className="grid grid-cols-2 gap-6 max-w-4xl mx-auto">
        {options.map((opt) => (
          <button
            key={opt.id}
            onClick={() => handleOptionClick(opt.id)}
            className={`p-6 rounded-xl text-xl font-bold transition-all ${
              selectedOption === opt.id
                ? 'bg-blue-600 text-white shadow-lg scale-105'
                : 'bg-white text-gray-700 hover:bg-blue-100 shadow-md'
            }`}
          >
            {opt.id}. {opt.text}
          </button>
        ))}
      </div>

      {selectedOption && (
        <div className="mt-8 text-center">
          {options.find(o => o.id === selectedOption)?.correct ? (
            <div className="text-2xl text-green-600 font-bold">
              ✓ 正确！JavaScript 是 Web 前端最流行的语言
            </div>
          ) : (
            <div className="text-2xl text-red-600 font-bold">
              ✗ 错误，请再试一次
            </div>
          )}
        </div>
      )}
    </div>
  );
}

window.CourseData = {
  id: 'quiz-sync',
  title: '选择题同步',
  slides: [
    { component: <MultipleChoiceSlide /> }
  ]
};
```

### 8. 拖拽放置同步（自动同步）

```javascript
function DragDropSlide() {
  // 同步拖拽状态
  const [draggedItem, setDraggedItem] = window.CourseGlobalContext.useSyncVar('drag:item', null);
  const [items, setItems] = window.CourseGlobalContext.useSyncVar('drag:items', [
    { id: 'item1', text: '三角形', color: 'bg-blue-500' },
    { id: 'item2', text: '圆形', color: 'bg-green-500' },
    { id: 'item3', text: '正方形', color: 'bg-red-500' }
  ]);
  const [placedItems, setPlacedItems] = window.CourseGlobalContext.useSyncVar('drag:placed', []);

  const handleDragStart = (itemId) => {
    setDraggedItem(itemId);
  };

  const handleDrop = (zoneId) => {
    if (!draggedItem) return;

    const item = items.find(i => i.id === draggedItem);
    if (item) {
      setPlacedItems([...placedItems, { ...item, zoneId }]);
      setItems(items.filter(i => i.id !== draggedItem));
    }
    setDraggedItem(null);
  };

  return (
    <div className="p-8 bg-gray-100 rounded-xl min-h-full">
      <h2 className="text-3xl font-bold text-center mb-8">形状分类</h2>

      {/* 待拖拽区域 */}
      <div className="bg-white p-6 rounded-lg shadow-md mb-6">
        <h3 className="text-xl font-bold mb-4">待分类形状</h3>
        <div className="flex gap-4 flex-wrap">
          {items.map((item) => (
            <div
              key={item.id}
              draggable
              onDragStart={() => handleDragStart(item.id)}
              className={`px-6 py-4 rounded-lg text-white font-bold cursor-move ${item.color} hover:scale-110 transition-transform`}
            >
              {item.text}
            </div>
          ))}
        </div>
      </div>

      {/* 放置区域 */}
      <div className="grid grid-cols-2 gap-6">
        {[
          { id: 'zone1', label: '有角的图形', icon: '🔺' },
          { id: 'zone2', label: '没有角的图形', icon: '⭕' }
        ].map((zone) => (
          <div
            key={zone.id}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => handleDrop(zone.id)}
            className="bg-white p-6 rounded-lg shadow-md border-4 border-dashed border-gray-300"
          >
            <h3 className="text-xl font-bold mb-4">{zone.icon} {zone.label}</h3>
            <div className="flex flex-wrap gap-2">
              {placedItems
                .filter(p => p.zoneId === zone.id)
                .map((item) => (
                  <div key={item.id} className={`px-4 py-2 rounded text-white text-sm ${item.color}`}>
                    {item.text}
                  </div>
                ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

window.CourseData = {
  id: 'drag-drop-sync',
  title: '拖拽同步',
  slides: [
    { component: <DragDropSlide /> }
  ]
};
```

### 9. 面板切换同步（自动同步）

```javascript
function PanelToggleSlide() {
  // 同步多个面板状态
  const [panels, setPanels] = window.CourseGlobalContext.useSyncVar('panel:state', {
    panel1: false,
    panel2: false,
    panel3: false
  });

  const togglePanel = (panelId) => {
    setPanels({
      ...panels,
      [panelId]: !panels[panelId]
    });
  };

  const panelContents = [
    { id: 'panel1', title: '知识点一', content: '这是第一个知识点的详细说明...' },
    { id: 'panel2', title: '知识点二', content: '这是第二个知识点的详细说明...' },
    { id: 'panel3', title: '知识点三', content: '这是第三个知识点的详细说明...' }
  ];

  return (
    <div className="p-8 bg-white rounded-xl">
      <h2 className="text-3xl font-bold text-center mb-8">知识卡片</h2>

      {/* 面板切换按钮 */}
      <div className="flex gap-4 mb-6">
        {panelContents.map((panel) => (
          <button
            key={panel.id}
            onClick={() => togglePanel(panel.id)}
            className={`px-6 py-3 rounded-lg font-bold transition-all ${
              panels[panel.id]
                ? 'bg-blue-600 text-white shadow-lg'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            {panel.title}
          </button>
        ))}
      </div>

      {/* 面板内容 */}
      <div className="space-y-4">
        {panelContents.map((panel) => (
          <div
            key={panel.id}
            className={`p-6 rounded-lg transition-all ${
              panels[panel.id]
                ? 'bg-blue-50 border-2 border-blue-300'
                : 'bg-gray-50 border-2 border-gray-200'
            }`}
          >
            <h3 className="text-xl font-bold mb-2">{panel.title}</h3>
            <p className="text-gray-600">{panel.content}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

window.CourseData = {
  id: 'panel-toggle',
  title: '面板切换同步',
  slides: [
    { component: <PanelToggleSlide /> }
  ]
};
```

### 10. 手动事件同步（高级）

```javascript
function ManualSyncSlide() {
  const [selectedAnswer, setSelectedAnswer] = useState(null);
  const [teacherComment, setTeacherComment] = useState('');

  // 教师端处理
  const handleAnswerSelect = (answerId) => {
    setSelectedAnswer(answerId);

    // 手动同步
    if (window.CourseGlobalContext?.syncInteraction) {
      window.CourseGlobalContext.syncInteraction('selectAnswer', {
        answerId,
        timestamp: Date.now()
      });
    }
  };

  const handleAddComment = () => {
    if (!teacherComment.trim()) return;

    // 手动同步评论
    if (window.CourseGlobalContext?.syncInteraction) {
      window.CourseGlobalContext.syncInteraction('addComment', {
        comment: teacherComment,
        timestamp: Date.now()
      });
    }
    setTeacherComment('');
  };

  // 学生端接收同步
  useEffect(() => {
    const handleTeacherInteraction = (e) => {
      const { event, payload } = e.detail;

      switch (event) {
        case 'selectAnswer':
          setSelectedAnswer(payload.answerId);
          break;
        case 'addComment':
          alert('教师留言：' + payload.comment);
          break;
        default:
          console.warn('Unknown event:', event);
      }
    };

    // 只在学生端监听
    if (!window.CourseGlobalContext?.isHost) {
      window.addEventListener('teacher-interaction', handleTeacherInteraction);
    }

    return () => {
      window.removeEventListener('teacher-interaction', handleTeacherInteraction);
    };
  }, []);

  return (
    <div className="p-12 bg-gradient-to-br from-green-50 to-blue-50 rounded-xl">
      <h2 className="text-4xl font-bold text-center mb-8">
        讨论题：什么是 JavaScript？
      </h2>

      {/* 答案选项 */}
      <div className="space-y-4 max-w-2xl mx-auto mb-8">
        {[
          { id: 'a', text: '一种编程语言' },
          { id: 'b', text: '一种数据库' },
          { id: 'c', text: '一种操作系统' }
        ].map((opt) => (
          <button
            key={opt.id}
            onClick={() => handleAnswerSelect(opt.id)}
            className={`w-full p-4 text-left rounded-lg font-bold text-lg transition-all ${
              selectedAnswer === opt.id
                ? 'bg-green-500 text-white shadow-lg'
                : 'bg-white text-gray-700 hover:bg-gray-100 shadow-md'
            }`}
          >
            {opt.text}
          </button>
        ))}
      </div>

      {/* 教师留言区域 */}
      {window.CourseGlobalContext?.isHost && (
        <div className="max-w-2xl mx-auto">
          <textarea
            value={teacherComment}
            onChange={(e) => setTeacherComment(e.target.value)}
            placeholder="教师留言..."
            className="w-full p-4 border-2 border-gray-300 rounded-lg mb-4"
            rows="3"
          />
          <button
            onClick={handleAddComment}
            className="w-full py-3 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700"
          >
            发送给所有学生
          </button>
        </div>
      )}
    </div>
  );
}

window.CourseData = {
  id: 'manual-sync',
  title: '手动同步',
  slides: [
    { component: <ManualSyncSlide /> }
  ]
};
```

---

## 模板示例

### 基础课件模板

```javascript
window.CourseData = {
  id: 'my-course',
  title: '课件标题',
  description: '课件描述',
  targetAudience: '目标受众',
  duration: '预计时长',
  slides: [
    {
      component: (
        <div className="p-12 text-center">
          <h1 className="text-4xl font-bold mb-6">欢迎</h1>
          <p className="text-xl text-gray-600">课程介绍</p>
        </div>
      )
    }
  ]
};
```

### 互动课件模板

```javascript
import { useState } from 'react';

function InteractiveTemplate() {
  const [state, setState] = useState(initialState);
  
  return (
    <div className="p-8 bg-white rounded-xl">
      {/* 你的内容 */}
    </div>
  );
}

window.CourseData = {
  id: 'interactive-course',
  title: '互动课件模板',
  slides: [
    { component: <InteractiveTemplate /> }
  ]
};
```

---

## 技巧提示

1. **使用 Tailwind CSS**：快速构建美观的界面
2. **状态管理**：使用 React Hooks 管理组件状态
3. **动画效果**：添加 `transition` 和 `animate` 类
4. **响应式设计**：使用 `md:`、`lg:` 等前缀
5. **错误处理**：使用 try-catch 包裹异步操作
6. **性能优化**：避免在渲染中创建大量对象
7. **可访问性**：添加适当的 ARIA 属性
