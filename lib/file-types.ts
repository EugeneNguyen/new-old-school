export type FileCategory = 'text' | 'image' | 'audio' | 'video' | 'unsupported';

export interface FileTypeClassification {
  category: FileCategory;
  mimeType: string;
  supported: boolean;
}

// Text file extensions
const TEXT_EXTENSIONS = new Set([
  '.txt', '.md', '.rst', '.log', '.csv', '.tsv',
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.json', '.yaml', '.yml', '.toml', '.ini', '.cfg', '.conf',
  '.css', '.scss', '.sass', '.less',
  '.html', '.htm', '.xml', '.svg',
  '.sh', '.bash', '.zsh', '.fish', '.ps1', '.bat', '.cmd',
  '.py', '.rb', '.go', '.rs', '.java', '.c', '.cpp', '.h', '.hpp', '.cs', '.swift', '.kt',
  '.sql', '.graphql', '.gql',
  '.env', '.gitignore', '.dockerignore', '.editorconfig',
]);

// Image file extensions
const IMAGE_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.ico', '.bmp', '.tiff', '.tif',
]);

// Audio file extensions
const AUDIO_EXTENSIONS = new Set([
  '.mp3', '.wav', '.ogg', '.flac', '.aac', '.m4a', '.opus', '.weba',
]);

// Video file extensions
const VIDEO_EXTENSIONS = new Set([
  '.mp4', '.webm', '.mov', '.avi', '.mkv', '.wmv', '.flv', '.m4v',
]);

// MIME type mapping
const MIME_TYPES: Record<string, string> = {
  // Text
  '.txt': 'text/plain',
  '.md': 'text/markdown',
  '.rst': 'text/rst',
  '.log': 'text/plain',
  '.csv': 'text/csv',
  '.tsv': 'text/tab-separated-values',
  '.ts': 'text/typescript',
  '.tsx': 'text/tsx',
  '.js': 'application/javascript',
  '.jsx': 'application/javascript',
  '.mjs': 'application/javascript',
  '.cjs': 'application/javascript',
  '.json': 'application/json',
  '.yaml': 'text/yaml',
  '.yml': 'text/yaml',
  '.toml': 'text/toml',
  '.ini': 'text/plain',
  '.cfg': 'text/plain',
  '.conf': 'text/plain',
  '.css': 'text/css',
  '.scss': 'text/x-scss',
  '.sass': 'text/x-sass',
  '.less': 'text/x-less',
  '.html': 'text/html',
  '.htm': 'text/html',
  '.xml': 'application/xml',
  '.svg': 'image/svg+xml',
  '.sh': 'application/x-sh',
  '.bash': 'application/x-sh',
  '.zsh': 'application/x-sh',
  '.fish': 'application/x-sh',
  '.ps1': 'application/x-powershell',
  '.bat': 'application/x-batch',
  '.cmd': 'application/x-batch',
  '.py': 'text/x-python',
  '.rb': 'text/x-ruby',
  '.go': 'text/x-go',
  '.rs': 'text/x-rust',
  '.java': 'text/x-java',
  '.c': 'text/x-c',
  '.cpp': 'text/x-c++',
  '.h': 'text/x-c',
  '.hpp': 'text/x-c++',
  '.cs': 'text/x-csharp',
  '.swift': 'text/x-swift',
  '.kt': 'text/x-kotlin',
  '.sql': 'text/x-sql',
  '.graphql': 'application/graphql',
  '.gql': 'application/graphql',
  '.env': 'text/plain',
  '.gitignore': 'text/plain',
  '.dockerignore': 'text/plain',
  '.editorconfig': 'text/plain',
  // Audio
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.flac': 'audio/flac',
  '.aac': 'audio/aac',
  '.m4a': 'audio/mp4',
  '.opus': 'audio/opus',
  '.weba': 'audio/webm',
  // Video
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.avi': 'video/x-msvideo',
  '.mkv': 'video/x-matroska',
  '.wmv': 'video/x-ms-wmv',
  '.flv': 'video/x-flv',
  '.m4v': 'video/x-m4v',
};

export function classifyFile(filename: string): FileTypeClassification {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  const extWithDot = '.' + ext;

  if (TEXT_EXTENSIONS.has(extWithDot)) {
    return {
      category: 'text',
      mimeType: MIME_TYPES[extWithDot] ?? 'text/plain',
      supported: true,
    };
  }

  if (IMAGE_EXTENSIONS.has(extWithDot)) {
    return {
      category: 'image',
      mimeType: MIME_TYPES[extWithDot] ?? 'image/png',
      supported: true,
    };
  }

  if (AUDIO_EXTENSIONS.has(extWithDot)) {
    return {
      category: 'audio',
      mimeType: MIME_TYPES[extWithDot] ?? 'audio/mpeg',
      supported: true,
    };
  }

  if (VIDEO_EXTENSIONS.has(extWithDot)) {
    return {
      category: 'video',
      mimeType: MIME_TYPES[extWithDot] ?? 'video/mp4',
      supported: true,
    };
  }

  return {
    category: 'unsupported',
    mimeType: 'application/octet-stream',
    supported: false,
  };
}

export function getMimeType(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  const extWithDot = '.' + ext;
  return MIME_TYPES[extWithDot] ?? 'application/octet-stream';
}

export function formatSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
  return date.toLocaleDateString();
}

export function getFileExtension(filename: string): string {
  return filename.split('.').pop()?.toLowerCase() ?? '';
}