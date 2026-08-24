export function defaultDropValues() {
  return {
    name: '给我投递文件',
    expiresIn: 86400,
    maxUploads: 5,
    maxFileSize: 500 * 1024 * 1024,
    allowedTypes: [] as string[],
  }
}
