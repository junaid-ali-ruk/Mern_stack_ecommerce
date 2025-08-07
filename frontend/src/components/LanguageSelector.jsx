import { useState } from 'react';
 

const LanguageSelector = () => {
  const [language, setLanguage] = useState('en');

  const handleChange = (e) => {
    setLanguage(e.target.value);
  };

  return (
    <div className="language-selector">
      <select value={language} onChange={handleChange}>
        <option value="en">English</option>
        <option value="ur">Urdu</option>
        <option value="fr">Hindi</option>
        <option value="de">Sindhi</option>
      </select>
    </div>
  );
};

export default LanguageSelector;
