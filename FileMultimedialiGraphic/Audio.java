public class Audio extends ContenutoRiproducibile {

    public Audio(String nome, String descrizione) {
        super(nome, descrizione);
    }

    @Override
    public String riproduci() {
        return "Riproduzione AUDIO -> " + toString();
    }
}
