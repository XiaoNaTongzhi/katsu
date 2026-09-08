import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideIonicAngular } from '@ionic/angular/standalone';
import { provideTranslateService } from '@ngx-translate/core';

import strokeData from '../../assets/data/kanji/strokes.json';
import { Point } from '../stroke/geometry';
import { flattenPath } from '../stroke/svg-path';
import { Attempt } from '../srs/srs';
import { WritingExerciseComponent } from './writing-exercise.component';

/** 上: three strokes, the fewest the deck asks for in a character that divides. */
const STROKES = strokeData.characters.find(character => character.kanji === '上')!.strokes;

/** 明: eight strokes, enough for a run of wrong ones to be a derailment. */
const LONG = strokeData.characters.find(character => character.kanji === '明')!.strokes;

/** The pad hands finished strokes over as points; this is that call. */
interface Judging {
  judge(points: Point[]): void;
}

describe('a deferred writing', () => {
  let fixture: ComponentFixture<WritingExerciseComponent>;
  let component: WritingExerciseComponent;
  let finished: Attempt[];

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [WritingExerciseComponent],
      providers: [provideIonicAngular(), provideTranslateService()],
    }).compileComponents();

    fixture = TestBed.createComponent(WritingExerciseComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('strokes', STROKES);
    fixture.componentRef.setInput('deferred', true);
    fixture.componentRef.setInput('hints', false);
    fixture.detectChanges();

    finished = [];
    component.finished.subscribe(attempt => finished.push(attempt));
  });

  const write = (stroke: string) =>
    (component as unknown as Judging).judge(flattenPath(stroke));

  /** The three strokes of 上, drawn as they are drawn. */
  const writeAll = () => STROKES.forEach(write);

  it('counts nothing against a character traced exactly', () => {
    writeAll();

    expect(finished).toEqual([{ mistakes: 0, hintsUsed: false }]);
  });

  /**
   * The bug this file was written for. Where the writing is judged at the end,
   * the gum is there to put it right before anyone looks: a learner who sees
   * their own stroke go wrong, rubs it out and writes it again has written the
   * character correctly, and used to be marked down for the stroke that is no
   * longer on the paper.
   */
  it('forgets a stroke that was rubbed out again', () => {
    write(STROKES[0]);
    write(STROKES[0]); // Where the second stroke was due: wrong, and it lands.
    component.undo();

    write(STROKES[1]);
    write(STROKES[2]);

    expect(finished).toEqual([{ mistakes: 0, hintsUsed: false }]);
  });

  it('still counts a wrong stroke that was left standing', () => {
    write(STROKES[0]);
    write(STROKES[0]);
    write(STROKES[2]);

    expect(finished).toEqual([{ mistakes: 1, hintsUsed: false }]);
  });

  /**
   * The count forgets an erased stroke; the praise does not. "Every stroke
   * first time" is a claim about how it went, and a stroke written twice was
   * not written once - so the review passes clean and says only that it is
   * done.
   */
  it('does not claim every stroke went first time when one was rewritten', () => {
    write(STROKES[0]);
    write(STROKES[0]);
    component.undo();
    write(STROKES[1]);
    write(STROKES[2]);

    expect(finished).toEqual([{ mistakes: 0, hintsUsed: false }]);
    expect((component as unknown as { flawless(): boolean }).flawless()).toBe(false);
  });

  /** Two strokes off and then back on the rails: those keep their reasons. */
  it('leaves a writing that recovered to its stroke-by-stroke reasons', () => {
    write(STROKES[0]);
    write(STROKES[0]); // second stroke, wrong
    write(STROKES[2]); // third stroke, as it should be

    const derailed = (component as unknown as { derailedFrom(): number | undefined }).derailedFrom();

    expect(derailed).toBeUndefined();
  });

  /** Starting over is the same promise as the gum, for the whole character. */
  it('forgets everything a restart takes off the paper', () => {
    write(STROKES[0]);
    write(STROKES[0]);
    component.restart();

    writeAll();

    expect(finished).toEqual([{ mistakes: 0, hintsUsed: false }]);
  });
});

/**
 * A writing that came apart says where, not ten times what: once a stroke is
 * missed or drawn twice, every stroke after it is judged against a model stroke
 * it was never meant to be, and those reasons are noise.
 */
describe('a deferred writing that came apart', () => {
  let component: WritingExerciseComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [WritingExerciseComponent],
      providers: [provideIonicAngular(), provideTranslateService()],
    }).compileComponents();

    const fixture = TestBed.createComponent(WritingExerciseComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('strokes', LONG);
    fixture.componentRef.setInput('deferred', true);
    fixture.componentRef.setInput('hints', false);
    fixture.detectChanges();
  });

  const write = (stroke: string) =>
    (component as unknown as Judging).judge(flattenPath(stroke));

  const derailedFrom = () =>
    (component as unknown as { derailedFrom(): number | undefined }).derailedFrom();

  /**
   * 明's first three strokes as they are, then one skipped: from the fourth on
   * every stroke lands where the one before it belonged. The eighth happens to
   * come home again, which does not make the four before it a list worth
   * reading.
   */
  it('names the stroke it came apart at', () => {
    LONG.slice(0, 3).forEach(write);
    LONG.slice(4).forEach(write);
    write(LONG[LONG.length - 1]);

    expect(derailedFrom()).toBe(4);
  });

  it('says nothing of the sort about a writing that only stumbled', () => {
    LONG.forEach((stroke, index) => write(index === 3 ? LONG[0] : stroke));

    expect(derailedFrom()).toBeUndefined();
  });

  /** Two in a row is a pair of mistakes, and keeps its two reasons. */
  it('leaves a pair of wrong strokes to their own reasons', () => {
    LONG.forEach((stroke, index) => write(index === 3 || index === 4 ? LONG[0] : stroke));

    expect(derailedFrom()).toBeUndefined();
  });

  it('keeps the reasons underneath, so standing them down stays a template decision', () => {
    LONG.slice(0, 3).forEach(write);
    LONG.slice(4).forEach(write);
    write(LONG[LONG.length - 1]);

    const reasons = (component as unknown as { offReasons(): unknown[] }).offReasons();

    expect(reasons.length).toBeGreaterThan(0);
  });
});
