const API_URL = process.env.REACT_APP_API_URL;

if (!API_URL) {
  throw new Error("REACT_APP_API_URL is missing");
}

export default API_URL.replace(/\/$/, "");