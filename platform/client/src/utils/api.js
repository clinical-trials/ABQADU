async function checkedResponse(url, options) {
  let response;
  try {
    response = await fetch(url, options);
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    throw new Error('Unable to reach the server. Check your connection and try again.');
  }
  if (!response.ok) {
    let payload;
    try { payload = await response.json(); } catch { /* The server may return an HTML error page. */ }
    throw new Error(typeof payload?.error === 'string' ? payload.error : `Request failed (${response.status}). Please try again.`);
  }
  return response;
}

export async function requestJson(url, options) {
  const response = await checkedResponse(url, options);
  if (response.status === 204) return null;
  try {
    return await response.json();
  } catch {
    throw new Error('The server returned an unreadable response. Please try again.');
  }
}

export async function requestList(url, options) {
  const data = await requestJson(url, options);
  if (!Array.isArray(data) || data.some(row => !row || typeof row !== 'object' || Array.isArray(row))) {
    throw new Error('The server returned an invalid list. Please try again.');
  }
  return data;
}

export async function requestPdf(url, options, filename) {
  const response = await checkedResponse(url, options);
  if (!response.headers.get('content-type')?.toLowerCase().includes('application/pdf')) {
    throw new Error('The server did not return a PDF. Please try again.');
  }
  const blob = await response.blob();
  const downloadUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = downloadUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(downloadUrl);
}
