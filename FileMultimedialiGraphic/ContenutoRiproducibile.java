public abstract class ContenutoRiproducibile extends Contenuto {

    public ContenutoRiproducibile(String nome, String descrizione) {
        super(nome, descrizione);
    }

    public abstract String riproduci();

    @Override
    public String esegui() {
        return riproduci();
    }
}
