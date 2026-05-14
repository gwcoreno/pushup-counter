# Improving push-up rep counting with ML

This app currently uses **rule-based** counting: elbow angles from [MediaPipe](https://developers.google.com/mediapipe/solutions/vision/pose_landmarker) landmarks, a simple **up → down → up** phase machine, and fixed thresholds (`DOWN_ANGLE`, `UP_ANGLE`, etc. in `PushUpCounter.tsx`).

A machine learning model would usually **replace or augment** that logic by learning from **labeled examples** of what you consider a completed rep.

## 1. Define ground truth

You need consistent labels. Common choices:

| Label style | Use case |
|-------------|----------|
| **Binary per frame** | “In bottom phase” vs not — derive reps from transitions. |
| **Binary per short clip** (e.g. ~2 s) | “Contains one completed rep” vs not. |
| **Event timestamps** | Mark exact times a rep is considered complete in a video. |

For counting, **phase labels** or **rep-completion events** aligned to time or frame index are usually clearest.

## 2. Collect data that matches production

- Same **camera angle** you care about (e.g. side view), **lighting**, **clothing**, and diversity of **body types**.
- Include **hard negatives**: partial reps, planks, squats, reaching out of frame, walking away.
- Order of magnitude: **hundreds** of clips for a first useful model; **thousands** for stronger cross-user robustness.

Label with any tool you prefer (e.g. [CVAT](https://www.cvat.ai/), [Label Studio](https://labelstud.io/), or a small internal UI that exports `video_id`, `frame`, `label`).

## 3. Feature options (light to heavy)

| Approach | Input | Notes |
|----------|--------|--------|
| **Learned thresholds / small classifier on angles** | Per frame: left/right elbow angle, shoulder/wrist height, etc. from landmarks | Small dataset, fast, interpretable; limited when pose is noisy. |
| **Sequence model on landmark features** | Last *T* frames × `(x, y, z, visibility)` for a focused joint set (shoulders, elbows, wrists, hips) | Captures motion; needs more data and **normalization** (e.g. relative to hip, scale by torso length, horizontal flip augmentation). |
| **End-to-end from pixels** | Raw video or a heavy CNN | Large data and compute needs; rarely necessary if MediaPipe pose is already available. |

A practical **middle path**: MediaPipe landmarks → **sliding window** (e.g. 0.5–1.0 s) → **small neural net** or **gradient-boosted trees** predicting phase or “rep just completed.”

## 4. Model types that fit “count reps”

- **Frame-wise multiclass**: e.g. `up_eccentric`, `bottom`, `up_concentric`, `other` — count when you see a valid transition (e.g. bottom → up), with rules to avoid double counts.
- **Binary “rep completion” on a window**: model outputs probability that a rep **ended** in the last *N* frames — increment when probability spikes and you enforce a **refractory period** (e.g. no second count for ~0.4 s).

The **refractory / cooldown** period is as important as the model for preventing double counts.

## 5. Typical training pipeline

1. Record clips; export per-frame **landmark** tables (same indices the app uses, e.g. shoulders/elbows/wrists: 11–16).
2. **Normalize** coordinates (subtract a root joint like the hip, scale by torso length; optional mirror augmentation).
3. Build **windows** of consecutive frames; attach labels.
4. Train with temporal context: **1D CNN**, **TCN**, **LSTM/GRU**, or a quick baseline with **HistGradientBoostingClassifier** on flattened windows.
5. Evaluate on a **held-out user** or session so you do not overfit one person’s setup.

## 6. Running the model in this Next.js app

- **TensorFlow.js** or **ONNX Runtime Web**: run the model in the **browser** in the same `requestAnimationFrame` loop as MediaPipe (low latency, privacy-friendly).
- **Server API**: send landmark sequences to your backend — simpler training stack sometimes, but adds **latency** and **privacy** considerations.

For a camera-based counter, **on-device** inference is usually preferable.

## 7. Baselines before full ML

Often a large fraction of improvement comes from **signal processing and rules**, not a bigger model:

- **EMA smoothing** on elbow angles  
- **Hysteresis** (different thresholds for entering “down” vs leaving it)  
- Requiring **both arms** vs a single arm when visibility allows  
- **Minimum time** spent in the bottom phase  
- **Refractory period** after each counted rep  

Benchmark any ML change against these on the **same labeled test set** so you know the extra complexity is worth it.

## Short recipe

1. Label **200–500** reps (plus negatives), aligned to frames or time.  
2. Export **MediaPipe landmark windows** from the same pipeline you ship.  
3. Train a **window classifier** or small **temporal model** for “rep completed” or **phase**.  
4. Add a **cooldown** between counts.  
5. Export to **TensorFlow.js** or **ONNX** and call it from the client loop (optionally blending with existing angle rules during rollout).

## Further reading

- [MediaPipe Pose Landmarker](https://developers.google.com/mediapipe/solutions/vision/pose_landmarker)  
- [TensorFlow.js](https://www.tensorflow.org/js)  
- [ONNX Runtime Web](https://onnxruntime.ai/docs/tutorials/web/)

If you constrain the problem (**browser-only**, **how much data you can collect**, **side vs front camera**), you can narrow this document to a single architecture and label schema for your team.
