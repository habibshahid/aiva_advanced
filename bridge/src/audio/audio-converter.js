/**
 * Audio Converter - PRESERVED FROM ORIGINAL
 * Your working audio conversion pipeline
 */

class AudioConverter {
    // µ-law decode table (preserved exactly)
    static ULAW_DECODE_TABLE = [
        -32124, -31100, -30076, -29052, -28028, -27004, -25980, -24956,
        -23932, -22908, -21884, -20860, -19836, -18812, -17788, -16764,
        -15996, -15484, -14972, -14460, -13948, -13436, -12924, -12412,
        -11900, -11388, -10876, -10364, -9852, -9340, -8828, -8316,
        -7932, -7676, -7420, -7164, -6908, -6652, -6396, -6140,
        -5884, -5628, -5372, -5116, -4860, -4604, -4348, -4092,
        -3900, -3772, -3644, -3516, -3388, -3260, -3132, -3004,
        -2876, -2748, -2620, -2492, -2364, -2236, -2108, -1980,
        -1884, -1820, -1756, -1692, -1628, -1564, -1500, -1436,
        -1372, -1308, -1244, -1180, -1116, -1052, -988, -924,
        -876, -844, -812, -780, -748, -716, -684, -652,
        -620, -588, -556, -524, -492, -460, -428, -396,
        -372, -356, -340, -324, -308, -292, -276, -260,
        -244, -228, -212, -196, -180, -164, -148, -132,
        -120, -112, -104, -96, -88, -80, -72, -64,
        -56, -48, -40, -32, -24, -16, -8, 0,
        32124, 31100, 30076, 29052, 28028, 27004, 25980, 24956,
        23932, 22908, 21884, 20860, 19836, 18812, 17788, 16764,
        15996, 15484, 14972, 14460, 13948, 13436, 12924, 12412,
        11900, 11388, 10876, 10364, 9852, 9340, 8828, 8316,
        7932, 7676, 7420, 7164, 6908, 6652, 6396, 6140,
        5884, 5628, 5372, 5116, 4860, 4604, 4348, 4092,
        3900, 3772, 3644, 3516, 3388, 3260, 3132, 3004,
        2876, 2748, 2620, 2492, 2364, 2236, 2108, 1980,
        1884, 1820, 1756, 1692, 1628, 1564, 1500, 1436,
        1372, 1308, 1244, 1180, 1116, 1052, 988, 924,
        876, 844, 812, 780, 748, 716, 684, 652,
        620, 588, 556, 524, 492, 460, 428, 396,
        372, 356, 340, 324, 308, 292, 276, 260,
        244, 228, 212, 196, 180, 164, 148, 132,
        120, 112, 104, 96, 88, 80, 72, 64,
        56, 48, 40, 32, 24, 16, 8, 0
    ];
    
    static convertUlawToPCM16(ulawBuffer) {
        const pcmBuffer = Buffer.alloc(ulawBuffer.length * 2);
        
        for (let i = 0; i < ulawBuffer.length; i++) {
            const ulawByte = ulawBuffer[i];
            const pcmValue = this.ULAW_DECODE_TABLE[ulawByte];
            pcmBuffer.writeInt16LE(pcmValue, i * 2);
        }
        
        return pcmBuffer;
    }
    
    static convertPCM16ToUlaw(pcmBuffer) {
        const samples = pcmBuffer.length / 2;
        const ulawBuffer = Buffer.alloc(samples);
        
        const BIAS = 0x84;
        const CLIP = 32635;
        
        for (let i = 0; i < samples; i++) {
            let pcm = pcmBuffer.readInt16LE(i * 2);
            
            let sign = (pcm >> 8) & 0x80;
            if (sign) pcm = -pcm;
            
            if (pcm > CLIP) pcm = CLIP;
            
            pcm += BIAS;
            
            let exponent = 7;
            for (let expMask = 0x4000; (pcm & expMask) === 0 && exponent > 0; exponent--, expMask >>= 1);
            
            let mantissa = (pcm >> (exponent + 3)) & 0x0F;
            
            let ulawbyte = ~(sign | (exponent << 4) | mantissa) & 0xFF;
            
            ulawBuffer[i] = ulawbyte;
        }
        
        return ulawBuffer;
    }
    
    static resample8to16(buffer) {
        const inputSamples = buffer.length / 2;
        const outputSamples = inputSamples * 2;
        const output = Buffer.alloc(outputSamples * 2);
        
        for (let i = 0; i < inputSamples; i++) {
            const sample = buffer.readInt16LE(i * 2);
            
            output.writeInt16LE(sample, i * 4);
            
            if (i < inputSamples - 1) {
                const nextSample = buffer.readInt16LE((i + 1) * 2);
                const interpolated = Math.round((sample + nextSample) / 2);
                output.writeInt16LE(interpolated, i * 4 + 2);
            } else {
                output.writeInt16LE(sample, i * 4 + 2);
            }
        }
        
        return output;
    }
    
    static resample24to8(buffer) {
        const inputLength = buffer.length - (buffer.length % 2);
        const inputSamples = inputLength / 2;
        
        const outputSamples = Math.floor(inputSamples / 3);
        const output = Buffer.alloc(outputSamples * 2);
        
        for (let i = 0; i < outputSamples; i++) {
            const srcIndex = i * 3;
            let sum = 0;
            let count = 0;
            
            for (let j = 0; j < 3; j++) {
                const sampleIndex = srcIndex + j;
                if (sampleIndex < inputSamples) {
                    sum += buffer.readInt16LE(sampleIndex * 2);
                    count++;
                }
            }
            
            if (count > 0) {
                const avgSample = Math.round(sum / count);
                const clampedSample = Math.max(-32768, Math.min(32767, avgSample));
                output.writeInt16LE(clampedSample, i * 2);
            }
        }
        
        return output;
    }
}

module.exports = AudioConverter;