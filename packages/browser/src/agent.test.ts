import { describe, it, expect } from 'vitest';
import { BrowserAgent } from './agent.js';
import { AgentState } from './types.js';
import { StubRuntime, StubPlanner, StubAuthorizer, StubVerifier } from './stubs.js';

function createAgent(overrides: {
  runtime?: StubRuntime;
  planner?: StubPlanner;
  authorizer?: StubAuthorizer;
  verifier?: StubVerifier;
} = {}) {
  const runtime = overrides.runtime ?? new StubRuntime();
  const planner = overrides.planner ?? new StubPlanner();
  const authorizer = overrides.authorizer ?? new StubAuthorizer();
  const verifier = overrides.verifier ?? new StubVerifier();
  return { agent: new BrowserAgent({ runtime, planner, authorizer, verifier }), runtime, planner, authorizer, verifier };
}

describe('BrowserAgent', () => {
  describe('happy path: open URL → extract title → verify', () => {
    it('succeeds with a simple extract plan', async () => {
      const { agent, runtime, planner, verifier } = createAgent();

      // Configure: extract the page title
      runtime.extractValues.set('title', 'AI Fable - Home');
      planner.plan_ = {
        actions: [
          { type: 'open', url: 'https://ai-fable.dev' },
          { type: 'extract', selector: 'title' },
        ],
        reasoning: 'Open the page and extract the title',
      };
      verifier.data = { title: 'AI Fable - Home' };

      const result = await agent.run({
        description: 'Get the title of the AI Fable homepage',
        startUrl: 'https://ai-fable.dev',
        expectedOutput: { title: 'AI Fable - Home' },
      });

      expect(result.state).toBe(AgentState.Success);
      expect(result.success).toBe(true);
      expect(result.data.title).toBe('AI Fable - Home');
      expect(result.actions).toHaveLength(2);
      expect(result.planAttempts).toBe(1);
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('executes actions in order', async () => {
      const { agent, runtime, planner } = createAgent();

      planner.plan_ = {
        actions: [
          { type: 'open', url: 'https://example.com' },
          { type: 'click', selector: '#login' },
          { type: 'type', selector: '#email', text: 'user@test.com' },
          { type: 'click', selector: '#submit' },
        ],
        reasoning: 'Login flow',
      };

      await agent.run({ description: 'login' });

      expect(runtime.executedActions).toHaveLength(4);
      expect(runtime.executedActions[0].type).toBe('open');
      expect(runtime.executedActions[1].type).toBe('click');
      expect(runtime.executedActions[2].type).toBe('type');
      expect(runtime.executedActions[3].type).toBe('click');
    });
  });

  describe('authorization', () => {
    it('fails if policy denies the plan', async () => {
      const { agent, planner, authorizer } = createAgent();

      planner.plan_ = {
        actions: [{ type: 'open', url: 'https://dangerous.site' }],
        reasoning: 'Open dangerous site',
      };
      authorizer.authorized = false;
      authorizer.reason = 'URL is blacklisted';

      const result = await agent.run({ description: 'go to dangerous site' });

      expect(result.state).toBe(AgentState.Failed);
      expect(result.success).toBe(false);
      expect(result.error).toContain('blacklisted');
    });
  });

  describe('execution failure → replan', () => {
    it('replans after an action failure', async () => {
      const runtime = new StubRuntime();
      const planner = new StubPlanner();
      const verifier = new StubVerifier();

      // First plan: click fails
      planner.plan_ = {
        actions: [
          { type: 'open', url: 'https://example.com' },
          { type: 'click', selector: '#missing-button' },
        ],
        reasoning: 'Click the button',
      };
      runtime.failActions.add('click');

      // Second plan (replan): no click needed
      planner.replan_ = {
        actions: [
          { type: 'open', url: 'https://example.com' },
          { type: 'extract', selector: 'h1' },
        ],
        reasoning: 'Skip the button, just extract',
      };

      const { agent } = createAgent({ runtime, planner, verifier });

      // Allow click on second attempt (remove failure)
      let attempt = 0;
      const originalExecute = runtime.execute.bind(runtime);
      runtime.execute = async (action) => {
        if (action.type === 'click') {
          attempt++;
          if (attempt === 1) {
            return { action, success: false, error: 'Element not found', durationMs: 0 };
          }
        }
        return originalExecute(action);
      };

      const result = await agent.run({ description: 'extract heading', maxAttempts: 3 });

      expect(result.success).toBe(true);
      expect(result.planAttempts).toBe(2);
    });

    it('fails after max attempts exhausted', async () => {
      const { agent, planner, verifier } = createAgent();

      planner.plan_ = {
        actions: [{ type: 'extract', selector: 'h1' }],
        reasoning: 'Extract heading',
      };
      verifier.passed = false;
      verifier.reason = 'Heading does not match expected';

      const result = await agent.run({
        description: 'get heading',
        maxAttempts: 2,
      });

      expect(result.state).toBe(AgentState.Failed);
      expect(result.success).toBe(false);
      expect(result.planAttempts).toBe(2);
      expect(result.error).toContain('does not match');
    });
  });

  describe('verification', () => {
    it('passes verification and returns extracted data', async () => {
      const { agent, runtime, planner, verifier } = createAgent();

      runtime.extractValues.set('.price', '$42.99');
      planner.plan_ = {
        actions: [
          { type: 'open', url: 'https://shop.example.com/product' },
          { type: 'extract', selector: '.price' },
        ],
        reasoning: 'Get the price',
      };
      verifier.data = { price: '$42.99' };

      const result = await agent.run({
        description: 'Get product price',
        expectedOutput: { price: '$42.99' },
      });

      expect(result.success).toBe(true);
      expect(result.data.price).toBe('$42.99');
    });

    it('fails verification and triggers replan', async () => {
      const planner = new StubPlanner();
      const verifier = new StubVerifier();
      let verifyCount = 0;

      planner.plan_ = {
        actions: [{ type: 'extract', selector: '.title' }],
        reasoning: 'Get title',
      };

      // Fail first, pass second
      const originalVerify = verifier.verify.bind(verifier);
      verifier.verify = async (task, actions) => {
        verifyCount++;
        if (verifyCount === 1) {
          return { passed: false, data: {} as Record<string, string>, reason: 'Title is empty' };
        }
        return { passed: true, data: { title: 'Found It' } };
      };

      const { agent } = createAgent({ planner, verifier });

      const result = await agent.run({ description: 'get title', maxAttempts: 3 });

      expect(result.success).toBe(true);
      expect(result.planAttempts).toBe(2);
      expect(result.data.title).toBe('Found It');
    });
  });

  describe('abort signal', () => {
    it('stops execution when aborted', async () => {
      const { agent, planner } = createAgent();
      const controller = new AbortController();
      controller.abort();

      planner.plan_ = {
        actions: [{ type: 'open', url: 'https://example.com' }],
        reasoning: 'Will be aborted',
      };

      const result = await agent.run({
        description: 'aborted task',
        signal: controller.signal,
      });

      expect(result.state).toBe(AgentState.Failed);
      expect(result.error).toContain('aborted');
    });
  });

  describe('planning failure', () => {
    it('fails if planner throws', async () => {
      const planner = new StubPlanner();
      planner.plan = async () => { throw new Error('Model unavailable'); };

      const { agent } = createAgent({ planner });

      const result = await agent.run({ description: 'will fail to plan' });

      expect(result.state).toBe(AgentState.Failed);
      expect(result.error).toContain('Model unavailable');
    });
  });

  describe('state machine transitions', () => {
    it('full happy path goes through correct states', async () => {
      const { agent, planner, runtime } = createAgent();

      runtime.extractValues.set('h1', 'Welcome');
      planner.plan_ = {
        actions: [
          { type: 'open', url: 'https://example.com' },
          { type: 'extract', selector: 'h1' },
        ],
        reasoning: 'Open and extract',
      };

      const result = await agent.run({ description: 'get heading' });

      // Final state should be success
      expect(result.state).toBe(AgentState.Success);
      // All actions should have been executed
      expect(result.actions.every((a) => a.success)).toBe(true);
    });
  });
});
