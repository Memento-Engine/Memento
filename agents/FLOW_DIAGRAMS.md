# Replanning Mechanism Flow Diagrams

## 1. High-Level Workflow

```
┌─────────────────────────────────────────────────────────────────┐
│                    START: User Query                           │
└────────────────────────────┬──────────────────────────────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │  PLANNER NODE   │
                    │  Create Plan    │
                    └────────┬────────┘
                             │
                             ▼
                    ┌──────────────────┐
                    │  EXECUTOR NODE   │
                    │  Execute Steps   │◄─────────┐
                    │  1, 2, 3, ...    │          │
                    └────────┬─────────┘          │
                             │                    │
              ┌──────────────┴──────────────┐     │
              │                            │     │
         Success          Failure/Empty    │     │
              │            Results         │     │
              │                ▼           │     │
              │         ┌─────────────────┴──┐  │
              │         │  SHOULD REPLAN?    │  │
              │         │  • Has dependents? │  │
              │         │  • Max attempts?   │  │
              │         └────┬────┬──────────┘  │
              │              │    │             │
              │             YES   NO            │
              │              │    │             │
              │              ▼    │             │
              │         ┌──────────┴──┐         │
              │         │ REPLANNER   │─────────┘
              │         │ NODE        │
              │         │ • Analyze   │
              │         │ • Revise    │
              │         │ • Validate  │
              │         └─────┬──────┘
              │               │
              ▼               │
        ┌──────────────┐      │
        │ FINAL ANSWER │◄─────┘
        │ NODE         │
        └──────┬───────┘
               │
               ▼
        ┌──────────────┐
        │ END: Return  │
        │ Result       │
        └──────────────┘
```

## 2. Executor Failure Detection Detail

```
┌──────────────────────────────────────────┐
│  Execute Current Step                    │
└────────────┬─────────────────────────────┘
             │
             ▼
    ┌────────────────────┐
    │ Step Succeeded?    │
    └─┬──────────────┬───┘
      │              │
     YES            NO
      │              │
      │              ▼
      │     ┌────────────────────┐
      │     │ Check Result Type  │
      │     └──┬────────┬────────┘
      │        │        │
      │        │        ▼
      │        │   ┌──────────────┐
      │        │   │ Empty Result?│
      │        │   │ • null/undef │
      │        │   │ • []         │
      │        │   │ • {}         │
      │        │   │ • ""         │
      │        │   └──┬───────┬───┘
      │        │      │       │
      │        │      YES     NO
      │        │      │       │
      │        │      ▼       │
      │        │  ┌───────────┴──┐
      │        │  │ Has Deps?    │
      │        │  │ Other steps  │
      │        │  │ depend on    │
      │        │  │ this output? │
      │        │  └─┬──────────┬─┘
      │        │    │          │
      │        │   YES        NO
      │        │    │          │
      │        │    ▼          ▼
      │        │  ┌────┐  ┌─────┐
      │        │  │REPL│  │CONT │
      │        │  │ AN │  │INUE │
      │        │  └────┘  └─────┘
      │        │
      ▼        ▼
   ┌───────────────┐
   │ Store Result  │
   │ Proceed       │
   └───────┬───────┘
           │
           ▼
    More steps?
```

## 3. Replanning Process

```
┌────────────────────────────────────────────────┐
│ REPLANNER NODE INVOKED                         │
│ Failed step detected, has dependents           │
└─────────────┬──────────────────────────────────┘
              │
              ▼
    ┌─────────────────────┐
    │ Check Replan Limit  │
    │ Current < Max (3)?  │
    └──┬──────────────┬───┘
       │              │
      YES            NO
       │              │
       │              ▼
       │        ┌──────────────┐
       │        │ Stop Replan  │
       │        │ Return state │
       │        │ w/ best      │
       │        │ results      │
       │        └──────────────┘
       │
       ▼
    ┌──────────────────────────┐
    │ Prepare Replan Context   │
    │ • Original goal          │
    │ • Previous plan (steps)  │
    │ • Failed step details    │
    │ • Execution result       │
    │ • Failure reason         │
    └────────┬─────────────────┘
             │
             ▼
    ┌──────────────────────────┐
    │ Invoke LLM with Replan   │
    │ Prompt                   │
    │ (with retries)           │
    └────────┬─────────────────┘
             │
             ▼
    ┌──────────────────────────┐
    │ Parse LLM Response       │
    │ Extract revised plan     │
    └────────┬─────────────────┘
             │
             ▼
    ┌──────────────────────────┐
    │ Validate Revised Plan    │
    │ • Schema validation      │
    │ • Step references       │
    │ • Dependency graph      │
    └──┬──────────────┬────────┘
       │              │
     VALID         INVALID
       │              │
       │              ▼
       │      ┌──────────────┐
       │      │ Retry with   │
       │      │ Exponential  │
       │      │ Backoff      │
       │      └──────┬───────┘
       │             │
       │   Max Retries?
       │      │      │
       │      │     YES (Error)
       │      │      │
       │      │      ▼
       │      │  ┌───────┐
       │      │  │THROW  │
       │      │  │ERROR  │
       │      │  └───────┘
       │      │
       │      NO
       │      │
       └──────┘
         │
         ▼
    ┌──────────────────────────┐
    │ Find Failed Step Index   │
    │ in Revised Plan          │
    └────────┬─────────────────┘
             │
             ▼
    ┌──────────────────────────┐
    │ Return Updated State     │
    │ • plan = revised plan    │
    │ • currentStep = index    │
    │ • replanAttempts++       │
    │ • shouldReplan = false   │
    └────────┬─────────────────┘
             │
             ▼
    Loop back to EXECUTOR
```

## 4. Failure Detection Decision Tree

```
                        ┌──────────────────┐
                        │ Step Completed?  │
                        └────┬────────┬────┘
                             │        │
                           YES       NO
                             │        │
                    ┌────────┘        └────────┐
                    │                         │
                    ▼                         ▼
         ┌──────────────────┐     ┌──────────────────────┐
         │ Check Result     │     │ Execution Error      │
         │ Empty/Null?      │     │ Caught Exception     │
         └────┬────────┬────┘     └────┬────────────┬────┘
              │        │               │            │
             YES       NO            YES           NO
              │        │               │            │
              │        ▼               │            ▼
              │     ┌────┐             │        ┌─────┐
              │     │ OK │             │        │THROW│
              │     └────┘             │        └─────┘
              │                        │
              ▼                        ▼
    ┌──────────────────┐    ┌────────────────────┐
    │ Has Dependents?  │    │ Max Attempts OK?   │
    └────┬────────┬────┘    └────┬────────────┬──┘
         │        │              │            │
        YES      NO            YES           NO
         │        │              │            │
         │        ▼              ▼            ▼
         │    ┌────┐        ┌────────┐   ┌──────┐
         │    │ OK │        │REPLAN! │   │THROW!│
         │    └────┘        └────────┘   └──────┘
         │
         ▼
    ┌──────────┐
    │ REPLAN!  │
    └──────────┘
```

## 5. State Transitions

```
State Transitions During Replanning:

Initial State
├─ replanAttempts = 0
├─ lastFailedStepId = undefined
├─ failureReason = undefined
├─ previousPlan = undefined
├─ shouldReplan = false
└─ currentStep = 0

                    Step Execution
                         │
                         ▼
                    ┌──────────┐
            ┌──────→│Executing │←──────┐
            │       └────┬─────┘       │
            │            │            │
            │      Empty or Error     │
            │            │            │
            │            ▼            │
            │      ┌──────────────┐   │
            │      │After Replan  │──┘
            │      │Detection     │
            │      └──────┬───────┘
            │             │
            │             ▼
            │      Replanning State
            │      ├─ replanAttempts = 1
            │      ├─ lastFailedStepId = "stepX"
            │      ├─ failureReason = "reason"
            │      ├─ previousPlan = old plan
            │      ├─ shouldReplan = true
            │      └─ currentStep = index of failed step
            │
            └──[Replanner]──→ Update State
                            ├─ plan = revised plan
                            ├─ replanAttempts = 2
                            ├─ shouldReplan = false
                            ├─ currentStep = new index
                            └─ lastFailedStepId = cleared

Final State (Success)
├─ replanAttempts = N (0-3)
├─ lastFailedStepId = undefined
├─ failureReason = undefined
├─ previousPlan = last revised plan (if replanned)
├─ shouldReplan = false
└─ stepResults = {all completed steps}
```

## 6. Configuration Impact

```
MAX_REPLAN_ATTEMPTS = 1
═════════════════════════════════════════
Execution 1 (fails) → Replan Once → Execution 2 → END
(Most aggressive, limits recovery attempts)

MAX_REPLAN_ATTEMPTS = 3 (DEFAULT)
═════════════════════════════════════════
Attempt 1 (fails) ─→ Replan 1 ─→ Attempt 2
     │                              │
     │          (fails)             │
     │                              ▼
     │                         Replan 2 ─→ Attempt 3
     │                              │
     │          (fails)             │
     │                              ▼
     │                         Replan 3 ─→ Attempt 4
     │                              │
     │          (succeeds or         │
     │           max reached)        │
     └──────────────────┬───────────┘
                        │
                        ▼
                   FinalAnswer

MAX_REPLAN_ATTEMPTS = 5
═════════════════════════════════════════
More recovery attempts available
Slower but more likely to find a working plan
```

## 7. Executor Main Loop Flow

```
for step i = currentStep; i < planLength; i++:
    │
    ├─→ [Verify dependencies]
    │
    ├─→ [Execute step]
    │
    ├─→ [Check result]
    │   │
    │   ├─→ Empty? → Has deps? → YES → RETURN REPLAN SIGNAL
    │   │                          NO → Store null, continue
    │   │
    │   ├─→ Error? → Max attempts? → YES → RETURN REPLAN SIGNAL
    │   │                             NO → THROW ERROR
    │   │
    │   └─→ Success → Store result, continue
    │
    └─→ Next iteration

RETURN: State with:
  ├─ If replanning: shouldReplan = true, lastFailedStepId set
  └─ If success: shouldReplan = false, currentStep at end
```
