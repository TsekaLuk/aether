namespace Aether.K0.Fragment

abbrev AllocationId := Nat

inductive Cell where
  | absent
  | live
  | dead
  deriving DecidableEq, Repr

inductive Command where
  | alloc (id : AllocationId)
  | dealloc (id : AllocationId)
  | halt
  deriving DecidableEq, Repr

inductive Event where
  | alloc (id : AllocationId)
  | dealloc (id : AllocationId)
  deriving DecidableEq, Repr

structure State where
  cell : AllocationId -> Cell

structure Config where
  command : Command
  state : State

def write (cells : AllocationId -> Cell) (id : AllocationId) (value : Cell) :
    AllocationId -> Cell :=
  fun candidate => if candidate = id then value else cells candidate

@[simp] theorem write_same (cells : AllocationId -> Cell) (id : AllocationId)
    (value : Cell) : write cells id value id = value := by
  simp [write]

inductive Step : Config -> Event -> Config -> Prop where
  | alloc (state : State) (id : AllocationId)
      (ready : state.cell id = .absent) :
      Step
        { command := .alloc id, state := state }
        (.alloc id)
        { command := .halt, state := { cell := write state.cell id .live } }
  | dealloc (state : State) (id : AllocationId)
      (ready : state.cell id = .live) :
      Step
        { command := .dealloc id, state := state }
        (.dealloc id)
        { command := .halt, state := { cell := write state.cell id .dead } }

theorem step_deterministic {before : Config} {event1 event2 : Event}
    {after1 after2 : Config} (first : Step before event1 after1)
    (second : Step before event2 after2) :
    event1 = event2 ∧ after1 = after2 := by
  cases first <;> cases second <;> simp_all

theorem alloc_marks_live {before after : Config} {id : AllocationId}
    (step : Step before (.alloc id) after) : after.state.cell id = .live := by
  cases step
  simp

theorem dealloc_requires_live {before after : Config} {id : AllocationId}
    (step : Step before (.dealloc id) after) : before.state.cell id = .live := by
  cases step
  assumption

theorem dealloc_marks_dead {before after : Config} {id : AllocationId}
    (step : Step before (.dealloc id) after) : after.state.cell id = .dead := by
  cases step
  simp

theorem every_step_has_explicit_resource_event {before after : Config}
    {event : Event} (step : Step before event after) :
    (exists id, event = .alloc id) ∨ (exists id, event = .dealloc id) := by
  cases step with
  | alloc _ id _ => exact Or.inl ⟨id, rfl⟩
  | dealloc _ id _ => exact Or.inr ⟨id, rfl⟩

inductive Ready : Config -> Prop where
  | alloc (state : State) (id : AllocationId)
      (ready : state.cell id = .absent) :
      Ready { command := .alloc id, state := state }
  | dealloc (state : State) (id : AllocationId)
      (ready : state.cell id = .live) :
      Ready { command := .dealloc id, state := state }
  | halt (state : State) : Ready { command := .halt, state := state }

def Terminal (config : Config) : Prop := config.command = .halt

theorem progress_fragment {config : Config} (ready : Ready config) :
    Terminal config ∨ exists event after, Step config event after := by
  cases ready with
  | alloc state id precondition =>
      exact Or.inr ⟨.alloc id, _, Step.alloc state id precondition⟩
  | dealloc state id precondition =>
      exact Or.inr ⟨.dealloc id, _, Step.dealloc state id precondition⟩
  | halt _ => exact Or.inl rfl

end Aether.K0.Fragment
