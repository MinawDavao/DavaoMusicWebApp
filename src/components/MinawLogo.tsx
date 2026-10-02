import React from 'react';

interface MinawLogoProps {
  className?: string;
  size?: number;
}

export const MinawLogo: React.FC<MinawLogoProps> = ({ className = 'w-8 h-8', size }) => {
  const sizeStyle = size ? { width: size, height: size } : undefined;

  return (
    <svg
      viewBox="0 0 200 200"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`minaw-durian-logo transition-transform duration-300 ${className}`}
      style={sizeStyle}
      aria-label="MINAW DVO Durian Soundwave Logo"
    >
      <defs>
        {/* Vibrant Cyan-Teal Gradient matching Davao music scene aesthetic */}
        <linearGradient id="minawDurianGrad" x1="88%" y1="6%" x2="12%" y2="94%">
          <stop offset="0%" stopColor="#4AE2D6" />
          <stop offset="28%" stopColor="#38BDF8" />
          <stop offset="68%" stopColor="#0EA5E9" />
          <stop offset="100%" stopColor="#0284C7" />
        </linearGradient>
      </defs>

      <g fill="url(#minawDurianGrad)">
        {/* 1. TOP-RIGHT STEM & SOCKET */}
        {/* Stem Socket Base Collar */}
        <path d="M136 50 L146 39 L156 47 L145 58 Z" />
        
        {/* Curved Durian Stalk with Inner Spur */}
        <path d="M141 44 C144 32 152 20 167 15 C178 12 188 15 192 23 C196 30 194 39 187 44 C183 47 178 46 177 42 C176 38 180 34 182 31 C183 29 181 26 177 25 C170 24 162 29 159 36 C157 41 161 41 164 43 C166 45 165 48 162 50 C157 52 154 49 152 46 C150 49 146 51 141 44 Z" />

        {/* 2. UPPER DURIAN SHELL (Above diagonal acoustic slice) */}
        <path
          fillRule="evenodd"
          clipRule="evenodd"
          d="
            M 132 58
            L 142 50 L 138 43 L 132 40 L 126 31 L 118 36 L 111 26 L 103 33 L 95 24 L 88 33 L 78 26 L 73 37 L 62 33 L 59 45 L 48 43 L 47 55 L 36 56 L 38 69 L 28 72 L 32 84 L 24 90 L 31 100 L 26 107
            L 40 108 L 47 95 L 124 48
            Z
            
            M 52 82
            L 58 72 L 67 76 L 73 65 L 83 70 L 90 59 L 99 65 L 107 55 L 116 63 L 121 54
            L 122 58 L 117 67 L 108 59 L 100 69 L 91 63 L 84 74 L 74 69 L 68 80 L 59 76
            Z
          "
        />

        {/* 3. CENTRAL DUAL SOUNDWAVE (Oscilloscope acoustic waveform across diagonal slice) */}
        {/* Wave Crest Ribbon */}
        <path d="
          M 40 128
          C 48 122, 54 116, 61 121
          C 68 126, 74 122, 81 113
          C 88 104, 94 104, 102 110
          C 110 116, 116 112, 124 101
          C 130 92, 137 92, 144 98
          L 141 104
          C 135 98, 129 98, 123 107
          C 115 118, 109 122, 101 116
          C 93 110, 87 110, 80 119
          C 73 128, 67 132, 60 127
          C 53 122, 47 128, 39 134
          Z
        " />

        {/* Wave Trough Ribbon */}
        <path d="
          M 47 138
          C 55 132, 61 126, 68 131
          C 75 136, 81 132, 88 123
          C 95 114, 101 114, 109 120
          C 117 126, 123 122, 131 111
          C 137 102, 144 102, 151 108
          L 148 114
          C 142 108, 136 108, 130 117
          C 122 128, 116 132, 108 126
          C 100 120, 94 120, 87 129
          C 80 138, 74 142, 67 137
          C 60 132, 54 138, 46 144
          Z
        " />

        {/* 4. LOWER DURIAN SHELL (Below diagonal acoustic slice) */}
        <path
          fillRule="evenodd"
          clipRule="evenodd"
          d="
            M 148 64
            L 161 74 L 157 85 L 169 94 L 163 105 L 173 116 L 164 126 L 171 138 L 159 146 L 163 158 L 150 163 L 149 175 L 136 177 L 132 188 L 119 186 L 112 195 L 99 190 L 90 196 L 79 187 L 69 190 L 61 179 L 51 178 L 47 165 L 40 162
            L 48 152 L 56 156 L 68 142 L 74 148 L 84 135 L 95 142 L 105 130 L 114 138 L 128 122 L 138 128 L 152 108
            Z

            M 75 168
            L 86 160 L 92 168 L 103 158 L 110 167 L 121 156 L 127 165 L 138 153 L 143 161
            L 141 166 L 136 158 L 125 170 L 119 161 L 108 172 L 101 163 L 90 173 L 84 165 L 73 173
            Z
          "
        />

        {/* 5. LOWER-LEFT TRANSIENT LIGHTNING / ACOUSTIC SPLIT */}
        <path d="M 42 165 L 52 153 L 62 158 L 72 144 L 68 141 L 59 154 L 50 149 L 39 162 Z" />
      </g>
    </svg>
  );
};
