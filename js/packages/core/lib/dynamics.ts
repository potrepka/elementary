import {
  createNode,
  isNode,
  resolve,
  ElemNode,
  NodeRepr_t,
} from "../nodeUtils";

import * as co from "./core";
import * as ma from "./math";
import * as si from "./signals";

const el = {
  ...co,
  ...ma,
  ...si,
};

/* A simple hard knee compressor with parameterized attack and release times,
 * threshold, and compression ratio.
 *
 * Users may drive the compressor with an optional sidechain signal, or send the
 * same input both as the input to be compressed and as the sidechain signal itself
 * for standard compressor behavior.
 *
 * @param {ElemNode} atkMs – attack time in milliseconds
 * @param {ElemNode} relMs – release time in millseconds
 * @param {ElemNode} threshold – decibel value above which the comp kicks in
 * @param {ElemNode} ratio – ratio by which we squash signal above the threshold
 * @param {ElemNode} sidechain – sidechain signal to drive the compressor
 * @param {ElemNode} xn – input signal to filter
 */
export function compress(
  attackMs: ElemNode,
  releaseMs: ElemNode,
  threshold: ElemNode,
  ratio: ElemNode,
  sidechain: ElemNode,
  xn: ElemNode,
): NodeRepr_t {
  const env = el.env(
    el.tau2pole(el.mul(0.001, attackMs)),
    el.tau2pole(el.mul(0.001, releaseMs)),
    sidechain,
  );

  const envDecibels = el.gain2db(env);

  // Calculate gain multiplier from the ratio (1 - 1/ratio)
  const adjustedRatio = el.sub(1, el.div(1, ratio));

  // Calculate gain reduction in dB
  const gain = el.mul(adjustedRatio, el.sub(threshold, envDecibels)); // adjustedRatio * (threshold - envDecibels);

  // Ensuring gain is not positive
  const cleanGain = el.min(0, gain);

  // Convert the gain reduction in dB to a gain factor
  const compressedGain = el.db2gain(cleanGain);

  return el.mul(xn, compressedGain);
}

/* A simple softknee compressor with parameterized attack and release times,
 * threshold, compression ratio and knee width.
 *
 * Functions like regular el.compress when kneeWidth is 0.
 *
 * Users may drive the compressor with an optional sidechain signal, or send the
 * same input both as the input to be compressed and as the sidechain signal itself
 * for standard compressor behavior.
 *
 * @param {ElemNode} atkMs – attack time in milliseconds
 * @param {ElemNode} relMs – release time in millseconds
 * @param {ElemNode} threshold – decibel value above which the comp kicks in
 * @param {ElemNode} ratio – ratio by which we squash signal above the threshold
 * @param {ElemNode} kneeWidth – width of the knee in decibels, 0 for hard knee
 * @param {ElemNode} sidechain – sidechain signal to drive the compressor
 * @param {ElemNode} xn – input signal to filter
 */
export function skcompress(
  attackMs: ElemNode,
  releaseMs: ElemNode,
  threshold: ElemNode,
  ratio: ElemNode,
  kneeWidth: ElemNode,
  sidechain: ElemNode,
  xn: ElemNode,
): NodeRepr_t {
  const env = el.env(
    el.tau2pole(el.mul(0.001, attackMs)),
    el.tau2pole(el.mul(0.001, releaseMs)),
    sidechain,
  );

  const envDecibels = el.gain2db(env);

  // Calculate the soft knee bounds around the threshold
  const lowerKneeBound = el.sub(threshold, el.div(kneeWidth, 2)); // threshold - kneeWidth/2
  const upperKneeBound = el.add(threshold, el.div(kneeWidth, 2)); // threshold + kneeWidth/2

  // Check if the envelope is in the soft knee range
  const isInSoftKneeRange = el.and(
    el.geq(envDecibels, lowerKneeBound), // envDecibels >= lowerKneeBound
    el.leq(envDecibels, upperKneeBound), // envDecibels <= upperKneeBound
  );

  // Calculate gain multiplier from the ratio (1 - 1/ratio)
  const adjustedRatio = el.sub(1, el.div(1, ratio));

  // Gain calculation
  // When in soft knee range, do:
  //   0.5 * adjustedRatio * ((envDecibels - lowerKneeBound) / kneeWidth) * (lowerKneeBound - envDecibels)
  // Else do:
  //   adjustedRatio * (threshold - envDecibels)
  //
  const gain = el.select(
    isInSoftKneeRange,
    el.mul(
      el.div(adjustedRatio, 2),
      el.mul(
        el.div(el.sub(envDecibels, lowerKneeBound), kneeWidth),
        el.sub(lowerKneeBound, envDecibels),
      ),
    ),
    el.mul(adjustedRatio, el.sub(threshold, envDecibels)),
  );

  // Ensuring gain is not positive
  const cleanGain = el.min(0, gain);

  // Convert the gain reduction in dB to a gain factor
  const compressedGain = el.db2gain(cleanGain);

  return el.mul(xn, compressedGain);
}
