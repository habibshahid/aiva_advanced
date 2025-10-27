"""
Roman Urdu Detector
Detect Roman Urdu (Urdu written in Latin script)
"""

import re
from typing import List


class RomanUrduDetector:
    """Detect Roman Urdu text"""
    
    def __init__(self):
        # Common Roman Urdu words
        self.roman_urdu_words = {
            'aap', 'main', 'hum', 'tum', 'ye', 'wo', 'hai', 'hain', 'tha', 'thi', 'the',
            'ka', 'ki', 'ke', 'se', 'ne', 'ko', 'mein', 'par', 'kya', 'koi', 'sab',
            'kuch', 'yeh', 'woh', 'agar', 'lekin', 'aur', 'ya', 'nahi', 'nahin',
            'acha', 'achha', 'theek', 'thik', 'kaise', 'kahan', 'kab', 'kyun', 'kyoon',
            'bahut', 'bohot', 'bhi', 'to', 'ab', 'phir', 'jab', 'tab',
            'shukriya', 'meherbani', 'khuda', 'allah', 'salaam', 'salam',
            'kitna', 'kitni', 'kitne', 'kaisay', 'kaisey',
            'apna', 'apni', 'apne', 'mera', 'meri', 'mere', 'tera', 'teri', 'tere',
            'hamara', 'hamari', 'hamare', 'tumhara', 'tumhari', 'tumhare',
            'iska', 'iski', 'iske', 'uska', 'uski', 'uske',
            'insha', 'mashallah', 'subhanallah', 'alhamdulillah'
        }
        
        # Common Urdu names in Roman script
        self.urdu_names = {
            'ahmed', 'ali', 'hassan', 'hussain', 'fatima', 'ayesha', 'zainab',
            'muhammad', 'mohammad', 'usman', 'umar', 'bilal', 'hamza',
            'karachi', 'lahore', 'islamabad', 'peshawar', 'quetta', 'multan',
            'pakistan', 'punjab', 'sindh', 'balochistan', 'kpk'
        }
    
    def detect(self, text: str) -> bool:
        """
        Detect if text contains Roman Urdu
        Returns True if Roman Urdu is detected
        """
        if not text:
            return False
        
        # Convert to lowercase for comparison
        text_lower = text.lower()
        
        # Split into words
        words = re.findall(r'\b\w+\b', text_lower)
        
        if not words:
            return False
        
        # Count Roman Urdu words
        roman_urdu_count = 0
        for word in words:
            if word in self.roman_urdu_words or word in self.urdu_names:
                roman_urdu_count += 1
        
        # If more than 10% of words are Roman Urdu, consider it Roman Urdu text
        threshold = 0.10
        ratio = roman_urdu_count / len(words)
        
        return ratio >= threshold
    
    def get_roman_urdu_words(self, text: str) -> List[str]:
        """
        Extract Roman Urdu words from text
        """
        if not text:
            return []
        
        text_lower = text.lower()
        words = re.findall(r'\b\w+\b', text_lower)
        
        roman_urdu_words = []
        for word in words:
            if word in self.roman_urdu_words or word in self.urdu_names:
                roman_urdu_words.append(word)
        
        return roman_urdu_words
    
    def normalize_roman_urdu(self, text: str) -> str:
        """
        Normalize Roman Urdu spellings
        (Different spellings of the same word)
        """
        normalizations = {
            'achha': 'acha',
            'bohot': 'bahut',
            'nahin': 'nahi',
            'thik': 'theek',
            'kyoon': 'kyun',
            'kaisey': 'kaise',
            'kaisay': 'kaise',
            'salam': 'salaam'
        }
        
        words = text.split()
        normalized_words = []
        
        for word in words:
            word_lower = word.lower()
            normalized = normalizations.get(word_lower, word)
            normalized_words.append(normalized)
        
        return ' '.join(normalized_words)