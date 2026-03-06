public class Video extends ContenutoRiproducibile {

    public Video(String nome, String descrizione) {
        super(nome, descrizione);
    }

    @Override
    public String riproduci() {
        return "Riproduzione VIDEO -> " + toString();
    }
}
