/**
 * Multi-Language IVR Components
 * 
 * Export all multi-language related components from this file
 * for easy importing in other parts of the application.
 */

export { default as MultiLangAudioTextInput } from './MultiLangAudioTextInput';

// Re-export helpers from API extensions
export { 
    getLanguageMetadata, 
    isRTL, 
    enrichLanguages 
} from '../../../services/ivrApiExtensions';