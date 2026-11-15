/*
 * Vendored from @met4citizen/headtts 1.3.0 (https://github.com/met4citizen/HeadTTS) - the English
 * text-to-phonemes part only, so The Spine's natural voice needs no GPL eSpeak. Browser-only trims
 * are marked "Spine:". Original licence:
 *
 * MIT License
 *
 * Copyright (c) 2025 Mika Suominen
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */
// Spine: only the two helpers the language modules use.
export function isNode() { return false; }
export function trace(...outputs) { try { console.log("[headtts]", ...outputs); } catch (e) {} }
export function deepCopy(o) { try { return structuredClone(o); } catch (e) { return JSON.parse(JSON.stringify(o)); } }
