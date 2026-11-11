<script>
  import { Button } from "@kingsnake/ui";
</script>

<div>
  <p>Shared Svelte UI package is connected.</p>

  <div class="actions">
    <Button variant="primary">Start game</Button>
    <Button variant="secondary">Watch match</Button>
    <Button variant="danger">Watch match</Button>
  </div>
</div>

<style>
  .actions {
    display: flex;
    gap: 1rem;
  }
</style>
