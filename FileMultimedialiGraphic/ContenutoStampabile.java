public abstract class ContenutoStampabile extends Contenuto {

    public ContenutoStampabile(String nome, String descrizione) {
        super(nome, descrizione);
    }

    public abstract String stampa();

    @Override
    public String esegui() {
        return stampa();
    }
}
