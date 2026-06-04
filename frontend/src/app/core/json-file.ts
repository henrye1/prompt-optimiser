/** Reads a File selected via <input type="file"> and parses it as JSON. */
export async function readJsonFile(file: File): Promise<unknown> {
  const text = await file.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error('Selected file is not valid JSON');
  }
}
